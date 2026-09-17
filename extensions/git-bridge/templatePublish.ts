import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import YAML from "yaml";
import {
  canonicalJson,
  compareUtf16CodeUnits,
  sha256Hex,
  sha256HexSyncText,
} from "@vibestudio/content-addressing";
import { GitClient, readExactGitSnapshot, withTemporaryGitCheckout } from "@vibestudio/git";
import type {
  GitTemplatePublishInput,
  GitTemplatePublishResult,
  TemplatePublicationReview,
} from "@vibestudio/service-schemas/gitInterop";
import { normalizeWorkspaceRepoPath } from "@vibestudio/workspace/remotes";
import {
  normalizeTemplateGitUrl,
  TEMPLATE_SOURCE_MANIFEST_PATH,
} from "@vibestudio/workspace/templateCoordinates";
import { validateTemplateSnapshotInventory } from "@vibestudio/workspace/templateManifest";
import { WorkspaceTemplateAuthoringMetadataSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import { createGitHubClient, resolveGitHubPublishOperation } from "@workspace/integrations/github";
import { getRemoteProvider } from "@workspace/integrations/remoteProviders";
import { GitBridge, type ProtectedRepositorySnapshot } from "./bridge.js";
import type { ExtensionContextLike } from "./context.js";

const MANIFEST_PATH = TEMPLATE_SOURCE_MANIFEST_PATH;
const BRANCH = "main";
const OPERATION_TRAILER = "Vibestudio-Template-Operation:";
const REQUEST_TRAILER = "Vibestudio-Template-Request:";

function safeJoin(root: string, relative: string): string {
  const target = path.resolve(root, ...relative.split("/"));
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Template publication path escapes checkout: ${relative}`);
  }
  return target;
}

function versionTag(value: string): string {
  return value.startsWith("v") ? value : `v${value}`;
}

interface PartSnapshot {
  repoPath: string;
  subdir: string;
  snapshot: ProtectedRepositorySnapshot;
}

interface CanonicalTreeEntry {
  path: string;
  mode: number;
  contentHash: string;
}

function canonicalTree(entries: readonly CanonicalTreeEntry[]): string {
  return canonicalJson(
    [...entries]
      .sort((left, right) => compareUtf16CodeUnits(left.path, right.path))
      .map(({ path: entryPath, mode, contentHash }) => ({
        path: entryPath,
        mode,
        contentHash,
      })),
  );
}

function trailer(message: string, name: string): string | null {
  const prefix = `${name} `;
  return (
    message
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() ?? null
  );
}

function assertRepositorySegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("/")) {
    throw new Error(`Template repository ${label} must be one non-empty path segment`);
  }
  return normalized;
}

function sameRepositoryIdentity(
  expected: GitTemplatePublishInput["destination"],
  actual: GitTemplatePublishResult["destination"],
): boolean {
  if (expected.provider !== actual.provider) return false;
  if (expected.provider === "github") {
    return (
      expected.owner.toLowerCase() === actual.owner.toLowerCase() &&
      expected.name.toLowerCase() === actual.name.toLowerCase()
    );
  }
  return expected.owner === actual.owner && expected.name === actual.name;
}

export class TemplatePublishEngine {
  constructor(
    private readonly ctx: ExtensionContextLike,
    private readonly bridge: GitBridge,
  ) {}

  private async prepare(input: Omit<GitTemplatePublishInput, "expectedRemoteCommit">) {
    const providerId = input.destination.provider;
    const provider = getRemoteProvider(providerId);
    if (!provider) throw new Error(`Unknown remote provider: ${providerId}`);
    const owner = assertRepositorySegment(input.destination.owner, "owner");
    const repoName = assertRepositorySegment(input.destination.name, "name");
    const destination = { provider: providerId, owner, name: repoName };
    if (
      `v1-sha256:${sha256Hex(new TextEncoder().encode(input.manifest))}` !== input.manifestDigest
    ) {
      throw new Error("Template manifest bytes do not match the inspected manifest digest");
    }
    const seen = new Set<string>();
    const parts = input.parts
      .map((part) => ({
        repoPath: normalizeWorkspaceRepoPath(part.repoPath),
        subdir: normalizeWorkspaceRepoPath(part.subdir),
      }))
      .sort((left, right) => compareUtf16CodeUnits(left.repoPath, right.repoPath));
    for (const part of parts) {
      if (seen.has(part.repoPath)) throw new Error(`Duplicate template part ${part.repoPath}`);
      seen.add(part.repoPath);
    }
    const protectedSnapshots = await this.bridge.readProtectedRepositories(
      parts.map(({ repoPath }) => repoPath),
      input.expectedMainEventId,
      input.operationId,
    );
    const snapshots: PartSnapshot[] = parts.map((part, index) => ({
      ...part,
      snapshot: protectedSnapshots[index]!,
    }));

    const expectedTreeEntries: CanonicalTreeEntry[] = [
      {
        path: MANIFEST_PATH,
        mode: 0o100644,
        contentHash: sha256Hex(new TextEncoder().encode(input.manifest)),
      },
    ];
    const occupiedPaths = new Set([MANIFEST_PATH]);
    for (const part of snapshots) {
      for (const file of part.snapshot.files) {
        const relative = `${part.subdir}/${file.path}`;
        if (part.repoPath === "meta" && part.subdir === "meta" && relative === MANIFEST_PATH) {
          continue;
        }
        if (occupiedPaths.has(relative)) {
          throw new Error(`Template publication maps multiple files to ${relative}`);
        }
        occupiedPaths.add(relative);
        expectedTreeEntries.push({
          path: relative,
          mode: file.mode & 0o111 ? 0o100755 : 0o100644,
          contentHash: sha256Hex(file.bytes),
        });
      }
    }
    const parsedManifest = YAML.parse(input.manifest) as Record<string, unknown>;
    const inventory = WorkspaceTemplateAuthoringMetadataSchema.parse(parsedManifest["template"]);
    validateTemplateSnapshotInventory(
      { repositories: inventory.repositories },
      expectedTreeEntries.map((entry) => entry.path),
    );
    const expectedTree = canonicalTree(expectedTreeEntries);
    const tag = versionTag(input.version);
    const requestFingerprint = `v1-sha256:${sha256HexSyncText(
      canonicalJson({
        protocol: "vibestudio-template-publication/v1",
        destination,
        version: tag,
        expectedMainEventId: input.expectedMainEventId,
        manifestDigest: input.manifestDigest,
        creation: {
          private: input.creation?.private ?? true,
          description: input.creation?.description ?? input.templateName,
        },
        parts: snapshots.map(({ repoPath, subdir, snapshot }) => ({
          repoPath,
          subdir,
          treeDigest: snapshot.treeDigest,
        })),
      }),
    )}`;

    return {
      providerId,
      provider,
      owner,
      repoName,
      destination,
      parts,
      snapshots,
      expectedTree,
      tag,
      requestFingerprint,
    };
  }

  async review(
    input: Omit<GitTemplatePublishInput, "expectedRemoteCommit">,
  ): Promise<TemplatePublicationReview> {
    const prepared = await this.prepare(input);
    if (prepared.providerId !== "github")
      throw new Error("Publication review currently supports GitHub repositories.");
    const { owner, repoName, snapshots } = prepared;
    const resolved = await resolveGitHubPublishOperation(this.ctx.credentials, {
      credentialId: input.credentialId,
      owner,
      publication: input.creation ? "repository" : "existing-repository",
    });
    const github = createGitHubClient(this.ctx.credentials, {
      credentialId: resolved.credentialId,
    });
    const url = `https://github.com/${owner}/${repoName}.git`;
    const git = new GitClient(fsp, {
      http: this.ctx.credentials.gitHttp({ credentialId: resolved.credentialId }),
    });
    const next = new Map<string, { bytes: Uint8Array; mode: number }>([
      [MANIFEST_PATH, { bytes: new TextEncoder().encode(input.manifest), mode: 0o100644 }],
    ]);
    for (const part of snapshots)
      for (const file of part.snapshot.files) {
        const name = `${part.subdir}/${file.path}`;
        if (name !== MANIFEST_PATH)
          next.set(name, { bytes: file.bytes, mode: file.mode & 0o111 ? 0o100755 : 0o100644 });
      }
    // A creation request is explicit. Never turn an inaccessible existing repository into a new one.
    let exists = true;
    try {
      const repo = await github.getRepo(owner, repoName);
      if (input.creation)
        throw new Error(
          "This repository already exists. Choose Existing repository and review again.",
        );
      if (!repo.permissions?.push || repo.archived || repo.disabled)
        throw new Error(
          "This GitHub account cannot push to the selected repository. Check repository access or connect another account.",
        );
    } catch (error) {
      if (input.creation && error instanceof Error && "status" in error && error.status === 404)
        exists = false;
      else throw error;
    }
    return withTemporaryGitCheckout(
      fsp,
      path.join(this.ctx.storage.root, "git-checkouts", "_template-reviews"),
      input.operationId,
      async (checkout) => {
        let remoteCommit: string | null = null;
        const before = new Map<string, { bytes: Uint8Array; mode: number }>();
        if (exists) {
          const branch = await git.getRemoteDefaultBranch(url);
          if (branch && branch !== BRANCH)
            throw new Error(`Template repositories require ${BRANCH} as the default branch.`);
          if (branch) {
            await git.clone({
              dir: checkout,
              url,
              ref: BRANCH,
              singleBranch: false,
              fullHistory: true,
            });
            remoteCommit = await git.resolveCommit(checkout, `refs/heads/${BRANCH}`);
            if (await git.resolveCommit(checkout, `refs/tags/${prepared.tag}`))
              throw new Error(`Release ${prepared.tag} already exists. Choose another version.`);
            if (remoteCommit)
              for (const entry of await git.readCommitTree(checkout, remoteCommit)) {
                if (entry.type !== "blob")
                  throw new Error(`Cannot review non-regular upstream entry: ${entry.path}`);
                before.set(entry.path, entry);
              }
          }
        }
        const changedFiles: TemplatePublicationReview["changedFiles"] = [];
        const store = async (bytes: Uint8Array) =>
          (
            await this.ctx.rpc.call<{ digest: string }>(
              "main",
              "blobstore.putBase64",
              Buffer.from(bytes).toString("base64"),
            )
          ).digest;
        for (const file of [...new Set([...before.keys(), ...next.keys()])].sort()) {
          const old = before.get(file),
            fresh = next.get(file);
          if (
            old &&
            fresh &&
            old.mode === fresh.mode &&
            sha256Hex(old.bytes) === sha256Hex(fresh.bytes)
          )
            continue;
          changedFiles.push({
            path: file,
            kind: !old ? "added" : !fresh ? "removed" : "changed",
            ...(old ? { oldHash: await store(old.bytes) } : {}),
            ...(fresh ? { newHash: await store(fresh.bytes) } : {}),
            binary: [old, fresh].some((entry) => entry?.bytes.includes(0)),
            tooLarge: [old, fresh].some((entry) => (entry?.bytes.length ?? 0) > 128 * 1024),
            oldMode: old?.mode ?? null,
            newMode: fresh?.mode ?? null,
          });
        }
        return { remoteCommit, changedFiles };
      },
    );
  }

  async publish(input: GitTemplatePublishInput): Promise<GitTemplatePublishResult> {
    const {
      providerId,
      provider,
      owner,
      repoName,
      destination,
      parts,
      snapshots,
      expectedTree,
      tag,
      requestFingerprint,
    } = await this.prepare(input);
    let credentialId = input.credentialId?.trim() || undefined;
    let credentialLabel: string | undefined;
    if (providerId === "github") {
      const resolved = await resolveGitHubPublishOperation(this.ctx.credentials, {
        ...(credentialId ? { credentialId } : {}),
        owner,
        publication: input.creation ? "repository" : "existing-repository",
      });
      credentialId = resolved.credentialId;
      credentialLabel = resolved.credentialLabel;
      if (resolved.destinationOwner.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(
          `GitHub credential resolved owner ${resolved.destinationOwner}, expected ${owner}`,
        );
      }
    }
    const existing =
      !input.creation && providerId === "github"
        ? await createGitHubClient(this.ctx.credentials, { credentialId }).getRepo(owner, repoName)
        : null;
    const repository = existing
      ? {
          destination,
          cloneUrl: `https://github.com/${owner}/${repoName}.git`,
          webUrl: existing.html_url,
          created: false,
        }
      : await provider.resolveOrCreateRepo(this.ctx.credentials, {
          destination,
          creation: {
            private: input.creation?.private ?? true,
            description: input.creation?.description ?? input.templateName,
          },
          ...(credentialId ? { credentialId } : {}),
        });
    if (!sameRepositoryIdentity(destination, repository.destination)) {
      throw new Error(
        `Remote provider resolved ${repository.destination.provider}:` +
          `${repository.destination.owner}/${repository.destination.name}, expected ` +
          `${destination.provider}:${destination.owner}/${destination.name}`,
      );
    }
    if (!provider.matches(repository.cloneUrl)) {
      throw new Error(
        `Remote provider ${provider.id} returned an incompatible clone URL: ${repository.cloneUrl}`,
      );
    }
    const git = new GitClient(fsp, {
      http: this.ctx.credentials.gitHttp({ credentialId: credentialId ?? null }),
    });
    return withTemporaryGitCheckout(
      fsp,
      path.join(this.ctx.storage.root, "git-checkouts", "_template-publications"),
      input.operationId,
      async (checkout) => {
        const defaultBranch = await git.getRemoteDefaultBranch(repository.cloneUrl);
        if (defaultBranch === null) {
          await git.init(checkout, BRANCH);
        } else {
          if (defaultBranch !== BRANCH) {
            throw new Error(
              `Template repository ${repository.webUrl} uses ${defaultBranch} as its default ` +
                `branch; template repositories require ${BRANCH}`,
            );
          }
          await git.clone({
            dir: checkout,
            url: repository.cloneUrl,
            ref: BRANCH,
            singleBranch: false,
            fullHistory: true,
          });
        }

        const tagCommit = await git.resolveCommit(checkout, `refs/tags/${tag}`);
        const mainCommit =
          defaultBranch === null ? null : await git.resolveCommit(checkout, `refs/heads/${BRANCH}`);
        const history =
          mainCommit === null
            ? []
            : await git.log(checkout, { ref: mainCommit, depth: Number.MAX_SAFE_INTEGER });
        const matchingOperations = history.filter(
          ({ message }) => trailer(message, OPERATION_TRAILER) === input.operationId,
        );
        if (matchingOperations.length > 1) {
          throw new Error(
            `Template history contains multiple commits for operation ${input.operationId}`,
          );
        }

        const readReceipt = async (commit: string) =>
          readExactGitSnapshot({
            git,
            dir: checkout,
            commit,
            label: `published template ${input.templateName}`,
            sink: {
              put: async (bytes) =>
                this.ctx.rpc.call<{ digest: string; size: number }>(
                  "main",
                  "blobstore.putBase64",
                  Buffer.from(bytes).toString("base64"),
                ),
            },
            reservedPaths: "exclude",
          });
        const result = async (commit: string): Promise<GitTemplatePublishResult> => {
          const exact = await readReceipt(commit);
          return {
            operationId: input.operationId,
            destination: repository.destination,
            created: repository.created,
            remoteUrl: repository.cloneUrl,
            webUrl: repository.webUrl,
            templateUrl: normalizeTemplateGitUrl(repository.cloneUrl),
            ...(credentialLabel ? { credential: credentialLabel } : {}),
            ref: `refs/tags/${tag}`,
            commit: exact.commit,
            parts: parts.map(({ repoPath }) => repoPath),
          };
        };

        const matchingOperation = matchingOperations[0];
        if (matchingOperation) {
          const recordedRequest = trailer(matchingOperation.message, REQUEST_TRAILER);
          if (recordedRequest !== requestFingerprint) {
            throw new Error(
              `Operation ${input.operationId} was already used for a different template publication`,
            );
          }
          const tree = await git.readCommitTree(checkout, matchingOperation.oid);
          if (tree.some((entry) => entry.type !== "blob")) {
            throw new Error(
              `Operation ${input.operationId} produced a non-regular template repository tree`,
            );
          }
          const actualTree = canonicalTree(
            tree.map((entry) => ({
              path: entry.path,
              mode: entry.mode,
              contentHash: entry.type === "blob" ? sha256Hex(entry.bytes) : "",
            })),
          );
          if (actualTree !== expectedTree) {
            throw new Error(
              `Operation ${input.operationId} is recorded with different template contents`,
            );
          }
          if (tagCommit !== null && tagCommit !== matchingOperation.oid) {
            throw new Error(`Immutable template tag ${tag} already points to a different commit`);
          }
          if (tagCommit === null) {
            await git.createTag(checkout, tag, matchingOperation.oid);
            await git.push({
              dir: checkout,
              url: repository.cloneUrl,
              ref: tag,
              remoteRef: `refs/tags/${tag}`,
            });
          }
          return result(matchingOperation.oid);
        }

        if (mainCommit !== input.expectedRemoteCommit) {
          throw new Error(
            "Upstream changed after review. Review the release again before publishing.",
          );
        }

        if (tagCommit !== null) {
          throw new Error(`Immutable template tag ${tag} already exists`);
        }

        for (const entry of await fsp.readdir(checkout)) {
          if (entry !== ".git") {
            await fsp.rm(path.join(checkout, entry), { recursive: true, force: true });
          }
        }
        const manifestPath = safeJoin(checkout, MANIFEST_PATH);
        await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
        await fsp.writeFile(manifestPath, input.manifest, "utf8");
        for (const part of snapshots) {
          for (const file of part.snapshot.files) {
            const relative = `${part.subdir}/${file.path}`;
            if (part.repoPath === "meta" && part.subdir === "meta" && relative === MANIFEST_PATH) {
              continue;
            }
            const fileDestination = safeJoin(checkout, relative);
            await fsp.mkdir(path.dirname(fileDestination), { recursive: true });
            await fsp.writeFile(fileDestination, file.bytes);
            await fsp.chmod(fileDestination, file.mode & 0o111 ? 0o755 : 0o644);
          }
        }
        await git.addAll(checkout);
        const commit = await git.commit({
          dir: checkout,
          message:
            `Publish ${input.templateName} ${tag}\n\n` +
            `${OPERATION_TRAILER} ${input.operationId}\n` +
            `${REQUEST_TRAILER} ${requestFingerprint}\n` +
            `Vibestudio-State: ${input.expectedMainEventId}\n` +
            `Vibestudio-Template-Manifest: ${input.manifestDigest}`,
          author: { name: "Vibestudio", email: "vibestudio@local" },
        });
        const committedTree = await git.readCommitTree(checkout, commit);
        const actualCommittedTree = canonicalTree(
          committedTree.map((entry) => ({
            path: entry.path,
            mode: entry.mode,
            contentHash: entry.type === "blob" ? sha256Hex(entry.bytes) : "",
          })),
        );
        if (
          committedTree.some((entry) => entry.type !== "blob") ||
          actualCommittedTree !== expectedTree
        ) {
          throw new Error("Published template commit does not match the exact protected-main plan");
        }
        await readReceipt(commit);
        try {
          await git.push({
            dir: checkout,
            url: repository.cloneUrl,
            ref: BRANCH,
            remoteRef: `refs/heads/${BRANCH}`,
          });
          await git.createTag(checkout, tag, commit);
          await git.push({
            dir: checkout,
            url: repository.cloneUrl,
            ref: tag,
            remoteRef: `refs/tags/${tag}`,
          });
          return result(commit);
        } catch (error) {
          throw new Error(
            `Publishing ${input.templateName} to ${repository.webUrl} failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { cause: error },
          );
        }
      },
    );
  }
}
