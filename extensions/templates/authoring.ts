import { Buffer } from "node:buffer";
import YAML from "yaml";
import {
  canonicalJson,
  compareUtf16CodeUnits,
  sha256HexSyncText,
  sortForCanonicalJson,
} from "@vibestudio/content-addressing";
import type {
  VcsReadFileResult,
  VcsResolveRepositoryResult,
} from "@vibestudio/service-schemas/vcs";
import type {
  TemplateAuthoringInspection,
  TemplateAuthoringIntent,
} from "@vibestudio/service-schemas/templates";
import { normalizeWorkspaceRepoPath } from "@vibestudio/workspace/remotes";
import { WorkspaceConfigTopLayerSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import { WORKSPACE_PACKAGE_SCOPES } from "@vibestudio/workspace-contracts/sourceDirs";
import type { WorkspaceConfig } from "@vibestudio/workspace-contracts/types";
import { parseTemplateManifestContent } from "@vibestudio/workspace/templateManifest";
import { resolveTemplateClosure } from "@vibestudio/workspace/templateClosure";
import type { ExtensionContextLike } from "./context.js";
import type { SemanticWorkspaceObservation } from "./workspace.js";

const META_REPOSITORY = "meta";
const WORKSPACE_DEPENDENCY = "workspace:";

function isAuthoredWorkspacePackage(name: string): boolean {
  return WORKSPACE_PACKAGE_SCOPES.some((scope) => name.startsWith(scope));
}

export interface TemplateAuthoringPart {
  repoPath: string;
  packageName?: string;
  templateAliases?: string[];
  templateUrls?: string[];
}

function text(file: NonNullable<VcsReadFileResult>): string {
  return file.content.kind === "text"
    ? file.content.text
    : Buffer.from(file.content.base64, "base64").toString("utf8");
}

function canonicalYaml(value: unknown): string {
  return YAML.stringify(sortForCanonicalJson(value), {
    lineWidth: 0,
    sortMapEntries: true,
  });
}

function sourceOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = (value as { source?: unknown }).source;
  return typeof source === "string" ? source : null;
}

function selectedRecords<T>(
  values: readonly T[] | undefined,
  selected: ReadonlySet<string>,
  source: (value: T) => string | null = sourceOf,
): T[] | undefined {
  const result = (values ?? []).filter((value) => {
    const repoPath = source(value);
    return repoPath !== null && selected.has(repoPath);
  });
  return result.length ? result : undefined;
}

function selectedGitMap<T>(
  value: Record<string, Record<string, T>> | undefined,
  selected: ReadonlySet<string>,
): Record<string, Record<string, T>> | undefined {
  if (!value) return undefined;
  const result: Record<string, Record<string, T>> = {};
  for (const [section, repos] of Object.entries(value)) {
    const kept = Object.fromEntries(
      Object.entries(repos).filter(([repo]) =>
        selected.has(`${section}/${repo}`),
      ),
    );
    if (Object.keys(kept).length) result[section] = kept;
  }
  return Object.keys(result).length ? result : undefined;
}

function projectManifest(
  config: WorkspaceConfig,
  selected: ReadonlySet<string>,
  files: readonly string[],
  presentation: { name: string; description: string },
  includeWorkspaceDefaults: boolean,
  dependencies: TemplateAuthoringIntent["dependencies"],
): string {
  const upstreams = selectedGitMap(config.git?.upstreams, selected);
  const portableUpstreams = upstreams
    ? Object.fromEntries(
        Object.entries(upstreams).map(([section, repos]) => [
          section,
          Object.fromEntries(
            Object.entries(repos).map(([repo, upstream]) => {
              const {
                authorEmail: _email,
                authorName: _name,
                ...portable
              } = upstream;
              return [repo, portable];
            }),
          ),
        ]),
      )
    : undefined;
  const providers = config.providers
    ? Object.fromEntries(
        Object.entries(config.providers).filter(([, declaration]) => {
          if (!declaration) return false;
          const ref =
            "source" in declaration
              ? declaration.source
              : "extension" in declaration
                ? declaration.extension
                : null;
          return ref !== null && selected.has(ref);
        }),
      )
    : undefined;
  const trust = config.trust
    ? Object.fromEntries(
        Object.entries(config.trust)
          .map(([key, values]) => [
            key,
            values?.filter((repoPath: string) => selected.has(repoPath)),
          ])
          .filter(([, values]) => Array.isArray(values) && values.length > 0),
      )
    : undefined;
  const hostTargets = config.hostTargets
    ? Object.fromEntries(
        Object.entries(config.hostTargets).filter(
          ([, target]) => target && selected.has(target.app),
        ),
      )
    : undefined;
  const runtime = WorkspaceConfigTopLayerSchema.parse({
    systemEpoch: config.systemEpoch,
    ...(config.defaultRepo && selected.has(config.defaultRepo)
      ? { defaultRepo: config.defaultRepo }
      : {}),
    ...(selectedRecords(config.initPanels, selected)
      ? { initPanels: selectedRecords(config.initPanels, selected) }
      : {}),
    ...(selectedRecords(config.singletonObjects, selected)
      ? { singletonObjects: selectedRecords(config.singletonObjects, selected) }
      : {}),
    ...(selectedRecords(config.services, selected)
      ? { services: selectedRecords(config.services, selected) }
      : {}),
    ...(selectedRecords(config.routes, selected)
      ? { routes: selectedRecords(config.routes, selected) }
      : {}),
    ...(selectedRecords(config.extensions, selected)
      ? { extensions: selectedRecords(config.extensions, selected) }
      : {}),
    ...(selectedRecords(config.apps, selected)
      ? { apps: selectedRecords(config.apps, selected) }
      : {}),
    ...(includeWorkspaceDefaults && config.panelRestorePolicy
      ? { panelRestorePolicy: config.panelRestorePolicy }
      : {}),
    ...(includeWorkspaceDefaults && config.defaultAgentConfig
      ? { defaultAgentConfig: config.defaultAgentConfig }
      : {}),
    ...(config.git &&
    (selectedGitMap(config.git.remotes, selected) || portableUpstreams)
      ? {
          git: {
            ...(selectedGitMap(config.git.remotes, selected)
              ? { remotes: selectedGitMap(config.git.remotes, selected) }
              : {}),
            ...(portableUpstreams ? { upstreams: portableUpstreams } : {}),
          },
        }
      : {}),
    ...(providers && Object.keys(providers).length ? { providers } : {}),
    ...(trust && Object.keys(trust).length ? { trust } : {}),
    ...(hostTargets && Object.keys(hostTargets).length ? { hostTargets } : {}),
  });
  return canonicalYaml({
    ...runtime,
    template: {
      ...presentation,
      // Declared so an installation acquires what this was built on, rather
      // than expecting to find it copied in here.
      ...(dependencies && dependencies.length > 0 ? { dependencies } : {}),
      repositories: [...selected].sort(compareUtf16CodeUnits),
      files: [...files].sort(compareUtf16CodeUnits),
    },
  });
}

async function standaloneFiles(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
): Promise<string[]> {
  const resolved = await repository(ctx, observation, META_REPOSITORY);
  const file = await ctx.rpc.call<VcsReadFileResult>("main", "vcs.readFile", {
    state: observation.mainState,
    repositoryId: resolved.repositoryId,
    file: { kind: "path", path: "vibestudio.yml" },
  });
  if (!file) throw new Error("Workspace meta/vibestudio.yml disappeared");
  return parseTemplateManifestContent(
    text(file),
    observation.runtimeTop.systemEpoch,
  ).inventory.files;
}

async function repository(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
  repoPath: string,
): Promise<NonNullable<VcsResolveRepositoryResult>> {
  const resolved = await ctx.rpc.call<VcsResolveRepositoryResult>(
    "main",
    "vcs.resolveRepository",
    {
      state: observation.mainState,
      repoPath,
    },
  );
  if (!resolved)
    throw new Error(`Workspace repository ${repoPath} disappeared`);
  return resolved;
}

async function packageMetadata(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
  repoPath: string,
): Promise<{ name?: string; dependencies: string[] }> {
  const resolved = await repository(ctx, observation, repoPath);
  const file = await ctx.rpc.call<VcsReadFileResult>("main", "vcs.readFile", {
    state: observation.mainState,
    repositoryId: resolved.repositoryId,
    file: { kind: "path", path: "package.json" },
  });
  if (!file) return { dependencies: [] };
  return parsePackageMetadata(repoPath, text(file));
}

function parsePackageMetadata(
  repoPath: string,
  source: string,
): { name?: string; dependencies: string[] } {
  let parsed: {
    name?: unknown;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    peerDependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(source) as typeof parsed;
  } catch {
    throw new Error(`${repoPath}/package.json is not valid JSON`);
  }
  const dependencies = [
    ...Object.entries(parsed.dependencies ?? {}),
    ...Object.entries(parsed.devDependencies ?? {}),
    ...Object.entries(parsed.peerDependencies ?? {}),
    ...Object.entries(parsed.optionalDependencies ?? {}),
  ]
    .filter(
      ([name, version]) =>
        isAuthoredWorkspacePackage(name) &&
        typeof version === "string" &&
        version.startsWith(WORKSPACE_DEPENDENCY),
    )
    .map(([name]) => name);
  return {
    ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
    dependencies: [...new Set(dependencies)].sort(compareUtf16CodeUnits),
  };
}

function runtimeReferences(
  config: WorkspaceConfig,
): Array<[owner: string, target: string]> {
  const refs: Array<[string, string]> = [];
  const add = (owner: string | null, target: string | null) => {
    if (owner && target) refs.push([owner, target]);
  };
  for (const item of config.initPanels ?? []) add(item.source, item.source);
  for (const item of config.singletonObjects ?? [])
    add(item.source, item.source);
  for (const item of config.services ?? []) add(item.source, item.source);
  for (const item of config.routes ?? []) add(item.source, item.source);
  for (const target of Object.values(config.hostTargets ?? {})) {
    if (!target) continue;
    for (const extension of target.requiresExtensions ?? [])
      add(target.app, extension);
  }
  return refs;
}

type AuthoringPackageMetadata = { name?: string; dependencies: string[] };

async function workspacePackageMetadata(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
  repoPaths: readonly string[],
): Promise<ReadonlyMap<string, AuthoringPackageMetadata>> {
  const entries: Array<readonly [string, AuthoringPackageMetadata]> = [];
  // A full workspace can contain hundreds of repositories. Keep semantic VCS
  // reads concurrent without flooding the extension RPC lane with an
  // unbounded Promise.all fan-out.
  const concurrency = 8;
  for (let offset = 0; offset < repoPaths.length; offset += concurrency) {
    entries.push(
      ...(await Promise.all(
        repoPaths
          .slice(offset, offset + concurrency)
          .map(
            async (repoPath) =>
              [
                repoPath,
                await packageMetadata(ctx, observation, repoPath),
              ] as const,
          ),
      )),
    );
  }
  return new Map(entries);
}

export async function inspectTemplateAuthoring(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
  rawRequest: TemplateAuthoringIntent,
  /**
   * Repositories the request's declared dependencies already supply.
   *
   * Resolved by the caller, because reading a dependency's inventory is a
   * network operation and this inspection has to stay a pure function of the
   * workspace state its fingerprint covers.
   */
  inheritedParts: readonly string[] = [],
): Promise<TemplateAuthoringInspection> {
  const name = rawRequest.name.trim();
  const description = rawRequest.description.trim();
  if (!name) throw new Error("Template name is required");
  if (!description) throw new Error("Template description is required");
  // A template built on another excludes the other's repositories instead of
  // copying them: the published manifest declares the dependency and an
  // installation acquires it. Without this the closure below walks straight
  // back into everything the dependency provides.
  const inherited = new Set(inheritedParts.map(normalizeWorkspaceRepoPath));
  const selectableParts = [...new Set([...observation.localRepoPaths])]
    .filter((repoPath) => repoPath !== META_REPOSITORY)
    .map(normalizeWorkspaceRepoPath)
    .sort(compareUtf16CodeUnits);
  const selectable = new Set(selectableParts);
  const requestedParts = [
    ...new Set(rawRequest.parts.map(normalizeWorkspaceRepoPath)),
  ].sort(compareUtf16CodeUnits);
  if (!requestedParts.length)
    throw new Error("Choose at least one workspace part");
  for (const repoPath of requestedParts) {
    if (inherited.has(repoPath)) {
      throw new Error(
        `Workspace repository ${repoPath} is already provided by a declared dependency`,
      );
    }
    if (!selectable.has(repoPath))
      throw new Error(`Unknown workspace repository ${repoPath}`);
  }

  const metadata = await workspacePackageMetadata(
    ctx,
    observation,
    selectableParts,
  );
  const packageOwners = new Map<string, string>();
  for (const [repoPath, value] of metadata) {
    if (!value.name) continue;
    const existing = packageOwners.get(value.name);
    if (existing && existing !== repoPath) {
      throw new Error(
        `Workspace package name ${value.name} is claimed by ${existing} and ${repoPath}`,
      );
    }
    packageOwners.set(value.name, repoPath);
  }

  // The authored manifest replaces meta/vibestudio.yml, while the exact meta
  // repository supplies its declared companions (including distributions).
  // Binding meta into the same protected-main receipt prevents a source
  // publication from mixing those files across workspace revisions.
  const runtime = runtimeReferences(observation.runtimeTop as WorkspaceConfig);
  // The walk is shared with the distribution builder, which computes the same
  // closure over a checkout instead of this workspace's reviewed VCS state.
  // Only these readers know how to resolve an edge from an observation.
  const closure = resolveTemplateClosure({
    // The authored manifest replaces meta/vibestudio.yml, while the exact meta
    // repository supplies its declared companions (including distributions).
    // Binding meta into the same protected-main receipt prevents a source
    // publication from mixing those files across workspace revisions.
    roots: [META_REPOSITORY, ...requestedParts],
    provided: inherited,
    packageDependenciesOf: (repoPath) =>
      metadata.get(repoPath)?.dependencies ?? [],
    ownerOfPackage: (dependency, dependent) => {
      const owner = packageOwners.get(dependency);
      if (!owner) {
        throw new Error(
          `${dependent} depends on missing workspace package ${dependency}`,
        );
      }
      return owner;
    },
    requiredRepositoriesOf: (repoPath) => {
      const targets: string[] = [];
      for (const [owner, target] of runtime) {
        if (owner !== repoPath) continue;
        if (!selectable.has(target) && !inherited.has(target))
          throw new Error(
            `${repoPath} references missing workspace part ${target}`,
          );
        targets.push(target);
      }
      return targets;
    },
  });
  const included = new Set(closure.included);
  const required = new Set(closure.required);

  const includedParts = closure.included;
  const manifest = projectManifest(
    observation.runtimeTop as WorkspaceConfig,
    new Set(includedParts.filter((repoPath) => repoPath !== META_REPOSITORY)),
    await standaloneFiles(ctx, observation),
    { name, description },
    selectableParts.every(
      (repoPath) => included.has(repoPath) || inherited.has(repoPath),
    ),
    rawRequest.dependencies,
  );
  const manifestDigest = `v1-sha256:${sha256HexSyncText(manifest)}` as const;
  const request: TemplateAuthoringIntent = {
    name,
    description,
    parts: requestedParts,
  };
  const body = {
    protocol: "vibestudio-template-authoring-plan-v1",
    request,
    mainEventId: observation.mainEventId,
    includedParts,
    manifestDigest,
  };
  return {
    request,
    mainEventId: observation.mainEventId,
    selectableParts,
    requestedParts,
    includedParts,
    requiredParts: [...required].sort(compareUtf16CodeUnits),
    manifest,
    manifestDigest,
    fingerprint: `v1-sha256:${sha256HexSyncText(canonicalJson(body))}`,
  };
}

export async function listTemplateAuthoringParts(
  ctx: ExtensionContextLike,
  observation: SemanticWorkspaceObservation,
): Promise<TemplateAuthoringPart[]> {
  const repoPaths = [...new Set([...observation.localRepoPaths])]
    .filter((repoPath) => repoPath !== META_REPOSITORY)
    .map(normalizeWorkspaceRepoPath)
    .sort(compareUtf16CodeUnits);
  return Promise.all(
    repoPaths.map(async (repoPath) => {
      const metadata = await packageMetadata(ctx, observation, repoPath);
      return {
        repoPath,
        ...(metadata.name ? { packageName: metadata.name } : {}),
      };
    }),
  );
}
