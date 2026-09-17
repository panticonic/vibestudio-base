import {
  TemplateOperations,
  type TemplateOperationStep,
} from "./operations.js";
import {
  canonicalSnapshotDigest,
  canonicalJson,
  sha256HexSyncText,
} from "@vibestudio/content-addressing";
import {
  normalizeTemplateGitUrl,
  canonicalTemplateNodeId,
} from "@vibestudio/workspace/templateCoordinates";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { vcsMethods } from "@vibestudio/service-schemas/vcs";
import type {
  VcsCompareResult,
  VcsExternalDeltaResult,
} from "@vibestudio/service-schemas/vcs";
import type {
  TemplateInspection,
  TemplateExactPin,
  TemplateSourceTree,
  TemplateUpdateReview,
  TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import type { ExtensionContextLike } from "./context.js";
import { observeWorkspace } from "./workspace.js";

type Request = Parameters<TemplatesClient["prepareUpdate"]>[0];
type TreeRepo = TemplateSourceTree["repositories"][number];
type Update = {
  request: Request;
  contextId: string;
  mainEventId: string;
  target: TemplateExactPin;
  before: TemplateSourceTree;
  after: TemplateSourceTree;
  steps: Record<string, TemplateOperationStep>;
  published: boolean;
};
const identity = (value: unknown) => sha256HexSyncText(canonicalJson(value));
const sameUrl = (a: string, b: string) =>
  normalizeTemplateGitUrl(a) === normalizeTemplateGitUrl(b);

export function createTemplateLifecycle(
  ctx: ExtensionContextLike,
  sources: {
    inspect(pin: TemplateExactPin): Promise<TemplateInspection>;
    resolve(source: {
      url: string;
      credential?: string;
    }): Promise<TemplateExactPin>;
  },
) {
  const vcs = createTypedServiceClient(
    "vcs",
    vcsMethods,
    (_service, method, args) => ctx.rpc.call("main", `vcs.${method}`, ...args),
  );
  const operations = new TemplateOperations<Update>(ctx, "template-updates");
  const serial = operations.serial.bind(operations);
  const save = operations.save.bind(operations);
  const load = operations.load.bind(operations);
  const step = operations.step.bind(operations);
  const status = (update: Update) =>
    vcs.status({ contextId: update.contextId });
  const envelope = async (update: Update, key: string) => ({
    commandId: `${update.contextId}:${key}`,
    contextId: update.contextId,
    expectedWorkingHead: (await status(update)).workingHead,
    intentSummary: "Review template update",
  });
  const changed = (update: Update) => {
    const before = new Map(
      update.before.repositories.map((repo) => [repo.repoPath, repo]),
    );
    const after = new Map(
      update.after.repositories.map((repo) => [repo.repoPath, repo]),
    );
    return [...new Set([...before.keys(), ...after.keys()])]
      .sort()
      .flatMap((repoPath) => {
        const old = before.get(repoPath),
          next = after.get(repoPath);
        if (old?.snapshot === next?.snapshot) return [];
        return [
          {
            repoPath,
            old,
            next,
            kind: !old
              ? ("added" as const)
              : !next
                ? ("removed" as const)
                : ("changed" as const),
          },
        ];
      });
  };
  const deltas = (update: Update) =>
    Object.entries(update.steps)
      .filter(([key, record]) => key.startsWith("delta:") && record.done)
      .map(([, record]) => record.result as VcsExternalDeltaResult);
  const compare = async (update: Update, deltaId: string) => {
    const coordinates: VcsCompareResult["coordinates"] = [];
    let cursor: string | undefined;
    const target = (await status(update)).workingHead;
    do {
      const page = await vcs.compare({
        target,
        source: { kind: "external-delta", deltaId },
        limit: 500,
        ...(cursor ? { cursor } : {}),
      });
      coordinates.push(...page.coordinates);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return coordinates;
  };
  const mergeClean = async (update: Update) => {
    for (const delta of deltas(update).filter(
      (delta) => !update.steps[`finalize:${delta.deltaId}`],
    )) {
      const all = await compare(update, delta.deltaId);
      const conflictingGroups = new Set(
        all
          .filter((item) => item.status === "conflict" && item.group)
          .map((item) => item.group),
      );
      const coordinates = all.filter(
        (item) =>
          ["adopt", "convergent", "composed"].includes(item.status) &&
          !conflictingGroups.has(item.group),
      );
      // Native merge decides semantic content and detects coupled coordinates.
      const groups = new Map<string, typeof coordinates>();
      for (const item of coordinates) {
        const group =
          item.group ?? `${item.coordinate.kind}:${item.coordinate.id}`;
        groups.set(group, [...(groups.get(group) ?? []), item]);
      }
      const batches: Array<typeof coordinates> = [];
      let batch: typeof coordinates = [];
      for (const group of groups.values()) {
        if (batch.length + group.length > 500 && batch.length) {
          batches.push(batch);
          batch = [];
        }
        batch.push(...group);
      }
      if (batch.length) batches.push(batch);
      for (const batch of batches) {
        const page = batch.map((item) => ({
          kind: item.coordinate.kind,
          id: item.coordinate.id,
        }));
        const key = `merge:${delta.deltaId}:${identity(page)}`;
        await step(update, key, "vcs.merge", [
          {
            ...(await envelope(update, key)),
            source: { kind: "external-delta", deltaId: delta.deltaId },
            coordinates: page,
          },
        ]);
      }
    }
  };
  const review = async (update: Update): Promise<TemplateUpdateReview> => {
    const conflicts: TemplateUpdateReview["conflicts"] = [];
    if (!update.published)
      for (const delta of deltas(update).filter(
        (delta) => !update.steps[`finalize:${delta.deltaId}`]?.done,
      )) {
        for (const coordinate of await compare(update, delta.deltaId))
          if (coordinate.status === "conflict")
            conflicts.push({
              deltaId: delta.deltaId,
              repoPath: delta.repoPath,
              coordinate,
            });
      }
    return {
      operationId: update.request.commandId,
      contextId: update.contextId,
      mainEventId: update.mainEventId,
      sourceUrl: update.request.sourceUrl,
      target: update.target,
      status: update.published ? "published" : "review",
      repositories: changed(update).map(({ repoPath, kind }) => ({
        repoPath,
        kind,
      })),
      conflicts,
    };
  };
  const stage = async (update: Update) => {
    if (update.published || update.steps["commit"] || update.steps["push"])
      return review(update);
    await step(update, "context", "runtime.createContext", [
      { contextId: update.contextId },
    ]);
    if ((await status(update)).mainEventId !== update.mainEventId)
      throw new Error(
        "Workspace main changed; prepare a new template update review.",
      );
    const changes = changed(update);
    // Import additions while the context is clean, before merging existing units.
    for (const item of changes) {
      const existing = await vcs.resolveRepository({
        state: { kind: "event", eventId: update.mainEventId },
        repoPath: item.repoPath,
      });
      if (!existing && item.old && item.next)
        throw new Error(
          `Template unit ${item.repoPath} was removed locally; restore it or resolve its ownership before updating.`,
        );
      if (existing || !item.next) continue;
      const key = `add:${item.repoPath}`;
      await step(update, key, "vcs.importSnapshot", [
        {
          ...(await envelope(update, key)),
          source: {
            kind: "generated",
            uri: normalizeTemplateGitUrl(update.request.sourceUrl),
            snapshotRevision: identity(update.after.sources),
          },
          repositories: [{ repoPath: item.repoPath, files: item.next.files }],
          message: `Add template unit ${item.repoPath}`,
        },
      ]);
    }
    for (const item of changes) {
      const existing = await vcs.resolveRepository({
        state: { kind: "event", eventId: update.mainEventId },
        repoPath: item.repoPath,
      });
      if (!existing) continue;
      const key = `delta:${item.repoPath}`;
      const emptySnapshot = canonicalSnapshotDigest([]);
      const source = (
        repo: TreeRepo | undefined,
        side: TemplateSourceTree,
      ) => ({
        kind: "generated",
        uri: normalizeTemplateGitUrl(update.request.sourceUrl),
        snapshotRevision: identity(side.sources),
        snapshot: repo?.snapshot ?? emptySnapshot,
      });
      await step<VcsExternalDeltaResult>(
        update,
        key,
        "vcs.registerExternalDelta",
        [
          {
            ...(await envelope(update, key)),
            repositoryId: existing.repositoryId,
            repoPath: item.repoPath,
            oldSource: source(item.old, update.before),
            newSource: source(item.next, update.after),
            oldFiles: item.old?.files ?? [],
            newFiles: item.next?.files ?? [],
          },
        ],
      );
    }
    await mergeClean(update);
    return review(update);
  };
  const installed = async () => {
    const observation = await observeWorkspace(ctx);
    return Promise.all(
      observation.templateSources.map(async (pin) => ({
        ...(await sources.inspect(pin)),
        relationship:
          observation.manifest.installation?.upstream &&
          sameUrl(pin.url, observation.manifest.installation.upstream.url)
            ? ("upstream" as const)
            : observation.templateDependencies.some((dependency) =>
                  sameUrl(dependency.url, pin.url),
                )
              ? ("direct" as const)
              : ("transitive" as const),
      })),
    );
  };
  const inspectContribution: TemplatesClient["inspectContribution"] = async (
    input,
  ) => {
    const observation = await observeWorkspace(ctx);
    const source = observation.templateSources.find((pin) =>
      sameUrl(pin.url, input.sourceUrl),
    );
    if (!source)
      throw new Error(
        "Choose a template recorded in this workspace's installed sources.",
      );
    const inspected = await sources.inspect(source);
    const parts = [...new Set(input.parts)].sort();
    for (const part of parts) {
      if (part === "meta" || !inspected.repositories.includes(part))
        throw new Error(
          `${part} is not an independently owned unit of ${source.url}. Publish a complete template to change its manifest.`,
        );
      if (!observation.localRepoPaths.has(part))
        throw new Error(`Selected unit ${part} is absent from workspace main.`);
    }
    const plan = { source, parts, mainEventId: observation.mainEventId };
    return { ...plan, fingerprint: `v1-sha256:${identity(plan)}` };
  };
  const suggestContribution: TemplatesClient["suggestContribution"] = async ({
    commandId,
    plan,
  }) => {
    const current = await inspectContribution({
      sourceUrl: plan.source.url,
      parts: plan.parts,
    });
    if (current.fingerprint !== plan.fingerprint)
      throw new Error(
        "Workspace source changed; review the contribution again.",
      );
    return ctx.extensions.invoke(
      "@workspace-extensions/git-bridge",
      "suggestTemplateContribution",
      [
        {
          operationId: commandId,
          nodeId: canonicalTemplateNodeId(plan.source.url, plan.source.commit),
          alias: plan.source.url,
          url: plan.source.url,
          baseCommit: plan.source.commit,
          expectedMainEventId: plan.mainEventId,
          parts: plan.parts.map((repoPath) => ({ repoPath, subdir: repoPath })),
          ...(plan.source.credential
            ? { credential: plan.source.credential }
            : {}),
        },
      ],
    );
  };
  return {
    installed,
    inspectContribution,
    suggestContribution,
    prepareUpdate: (request: Request) =>
      serial(request.commandId, async () => {
        let update: Update;
        try {
          update = await load(request.commandId);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          const observation = await observeWorkspace(ctx);
          const prior = observation.templateSources.find((pin) =>
            sameUrl(pin.url, request.sourceUrl),
          );
          if (!prior)
            throw new Error(
              "This workspace has no recorded exact source for that template.",
            );
          const target = request.target ?? (await sources.resolve(prior));
          if (!sameUrl(prior.url, target.url))
            throw new Error(
              "An update must keep the template repository identity.",
            );
          if (prior.commit === target.commit)
            throw new Error(
              "This template is already at the selected version.",
            );
          const before = await ctx.rpc.call<TemplateSourceTree>(
            "main",
            "workspaceTemplateSource.composeExact",
            {
              sources: observation.templateSources,
              purpose: observation.manifest.installation?.upstream
                ? "author"
                : "use",
            },
          );
          const after = await ctx.rpc.call<TemplateSourceTree>(
            "main",
            "workspaceTemplateSource.composeExact",
            {
              purpose: observation.manifest.installation?.upstream
                ? "author"
                : "use",
              sources: observation.templateSources.map((pin) =>
                sameUrl(pin.url, target.url) ? target : pin,
              ),
            },
          );
          if (
            !after.sources.some(
              (pin) =>
                sameUrl(pin.url, target.url) && pin.commit === target.commit,
            )
          )
            throw new Error(
              "A template dependency pins another exact version; update that declaration before selecting this release.",
            );
          update = {
            request,
            contextId: `template-update-${identity(request.commandId).slice(0, 24)}`,
            mainEventId: observation.mainEventId,
            target,
            before,
            after,
            steps: {},
            published: false,
          };
          await save(update);
        }
        if (canonicalJson(update.request) !== canonicalJson(request))
          throw new Error(
            "Update operation ID was already used for a different request.",
          );
        return stage(update);
      }),
    reviewUpdate: ({ operationId }: { operationId: string }) =>
      serial(operationId, async () => review(await load(operationId))),
    readUpdateFile: (input: Parameters<TemplatesClient["readUpdateFile"]>[0]) =>
      serial(input.operationId, async () => {
        const update = await load(input.operationId);
        if (!changed(update).some((item) => item.repoPath === input.repoPath))
          throw new Error("Unit is not part of this update");
        const read = async (tree: TemplateSourceTree) => {
          const descriptor = tree.repositories
            .find((repo) => repo.repoPath === input.repoPath)
            ?.files.find((file) => file.path === input.path);
          if (!descriptor) return null;
          const encoded = await ctx.rpc.call<string | null>(
            "main",
            "blobstore.getBase64",
            descriptor.contentHash,
          );
          if (encoded === null)
            throw new Error("Update content is unavailable");
          const bytes = Buffer.from(encoded, "base64");
          if (bytes.length > 128 * 1024)
            return "[File exceeds the 128 KiB preview limit]";
          if (bytes.includes(0)) return "[Binary file]";
          try {
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            return "[Binary file]";
          }
        };
        const state = (await status(update)).workingHead;
        const repo = await vcs.resolveRepository({
          state,
          repoPath: input.repoPath,
        });
        const local =
          repo &&
          (await vcs.readFile({
            state,
            repositoryId: repo.repositoryId,
            file: { kind: "path", path: input.path },
          }));
        return {
          base: await read(update.before),
          ours: !local
            ? null
            : local.content.kind === "text"
              ? local.content.text.length > 128 * 1024
                ? "[File exceeds the 128 KiB preview limit]"
                : local.content.text
              : "[Binary file]",
          theirs: await read(update.after),
        };
      }),
    resolveUpdate: (input: Parameters<TemplatesClient["resolveUpdate"]>[0]) =>
      serial(input.operationId, async () => {
        const update = await load(input.operationId);
        if (update.published) return review(update);
        const key = `resolve:${identity(input)}`;
        if (update.steps[key]) {
          await step(update, key, "vcs.merge", []);
          await mergeClean(update);
          return review(update);
        }
        const current = await review(update);
        const conflict = current.conflicts.find(
          (item) =>
            item.deltaId === input.deltaId &&
            item.coordinate.coordinate.kind === input.coordinate.kind &&
            item.coordinate.coordinate.id === input.coordinate.id,
        );
        if (!conflict)
          throw new Error("This conflict changed; refresh the update review.");
        const group = conflict.coordinate.group;
        const coordinates = (await compare(update, input.deltaId)).filter(
          (item) =>
            group
              ? item.group === group
              : item.coordinate.id === input.coordinate.id,
        );
        const resolutions = coordinates.map((item) => ({
          coordinate: { kind: item.coordinate.kind, id: item.coordinate.id },
          resolution: input.resolution,
        }));
        await step(update, key, "vcs.merge", [
          {
            ...(await envelope(update, key)),
            source: { kind: "external-delta", deltaId: input.deltaId },
            resolutions,
          },
        ]);
        await mergeClean(update);
        return review(update);
      }),
    publishUpdate: ({ operationId }: { operationId: string }) =>
      serial(operationId, async () => {
        const update = await load(operationId);
        if (update.published) return review(update);
        if (update.steps["push"]) {
          await step(update, "push", "vcs.push", []);
          update.published = true;
          await save(update);
          return review(update);
        }
        const current = update.steps["commit"]
          ? await review(update)
          : await stage(update);
        if (current.conflicts.length)
          throw new Error("Resolve every update conflict before publishing.");
        for (const item of changed(update).filter(
          (item) => item.kind === "removed",
        )) {
          const state = (await status(update)).workingHead;
          const repo = await vcs.resolveRepository({
            state,
            repoPath: item.repoPath,
          });
          if (!repo) continue;
          const files = await vcs.listFiles({
            state,
            repositoryId: repo.repositoryId,
            limit: 1,
          });
          if (files.files.length) continue; // Explicitly kept local files retain their unit.
          const key = `remove:${item.repoPath}`;
          await step(update, key, "vcs.edit", [
            {
              ...(await envelope(update, key)),
              changes: [
                { kind: "repository-delete", repositoryId: repo.repositoryId },
              ],
            },
          ]);
        }
        let state = await status(update);
        if (!state.clean) {
          await step(update, "commit", "vcs.commit", [
            {
              ...(await envelope(update, "commit")),
              message: `Update template ${update.target.url}`,
            },
          ]);
          state = await status(update);
        }
        for (const delta of deltas(update)) {
          const key = `finalize:${delta.deltaId}`;
          await step(update, key, "vcs.finalizeExternalDelta", [
            { ...(await envelope(update, key)), deltaId: delta.deltaId },
          ]);
        }
        await step(update, "push", "vcs.push", [
          {
            commandId: `${update.contextId}:push`,
            contextId: update.contextId,
            expectedCommittedEventId: state.committed.eventId,
            expectedMainEventId: update.mainEventId,
          },
        ]);
        update.published = true;
        await save(update);
        return review(update);
      }),
  };
}
