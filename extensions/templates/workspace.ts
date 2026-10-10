import { Buffer } from "node:buffer";
import type {
  VcsReadFileResult,
  VcsListDirectoryResult,
  VcsResolveRepositoryResult,
  VcsStateNodeRef,
} from "@vibestudio/service-schemas/vcs";
import {
  installedDependencyLayers,
  parseTemplateManifestContent,
  rootRuntimeFromTemplateManifest,
  type ParsedTemplateManifest,
} from "@vibestudio/workspace/templateManifest";
import { parseWorkspaceSystemEpochEnvelope } from "@vibestudio/workspace/configParser";
import type {
  WorkspaceTemplatePin,
  WorkspaceTemplateDependency,
  WorkspaceTemplateInstallation,
} from "@vibestudio/workspace-contracts/types";
import type { ExtensionContextLike } from "./context.js";

export const META_REPOSITORY = "meta";
async function authoringStep<T>(
  ctx: ExtensionContextLike,
  step: string,
  operation: () => Promise<T>,
): Promise<T> {
  ctx.log.info("Template authoring metadata step started", { step });
  try {
    const result = await operation();
    ctx.log.info("Template authoring metadata step completed", { step });
    return result;
  } catch (error) {
    ctx.log.warn?.("Template authoring metadata step failed", {
      step,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export interface SemanticWorkspaceObservation {
  mainEventId: string;
  mainState: VcsStateNodeRef;
  runtimeTop: ReturnType<typeof rootRuntimeFromTemplateManifest>;
  manifest: ParsedTemplateManifest;
  installation: WorkspaceTemplateInstallation | null;
  localRepoPaths: Set<string>;
  templateDependencies: readonly WorkspaceTemplateDependency[];
  templateSources: readonly WorkspaceTemplatePin[];
}

async function listDirectory(
  ctx: ExtensionContextLike,
  state: VcsStateNodeRef,
  directory: string,
) {
  const entries: NonNullable<VcsListDirectoryResult>["entries"] = [];
  let cursor: string | undefined;
  do {
    const page = await authoringStep(
      ctx,
      `listDirectory:${directory || "."}`,
      () =>
        ctx.rpc.call<VcsListDirectoryResult>("main", "vcs.listDirectory", {
          state,
          path: directory,
          ...(cursor ? { cursor } : {}),
          limit: 500,
        }),
    );
    if (!page) break;
    entries.push(...page.entries);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return entries;
}
async function repositoryPaths(
  ctx: ExtensionContextLike,
  state: VcsStateNodeRef,
) {
  const result = new Set<string>();
  const roots = await listDirectory(ctx, state, "");
  for (const root of roots) {
    if (root.repositoryRoot) result.add(root.path);
  }
  const nestedEntries = await Promise.all(
    roots
      .filter((root) => root.kind === "directory" && !root.repositoryRoot)
      .map((root) => listDirectory(ctx, state, root.path)),
  );
  for (const entries of nestedEntries)
    for (const entry of entries)
      if (entry.repositoryRoot) result.add(entry.path);
  return result;
}
export async function observeWorkspace(
  ctx: ExtensionContextLike,
): Promise<SemanticWorkspaceObservation> {
  ctx.log.info("Template authoring metadata observation started");
  const mainState = await authoringStep(ctx, "mainState", () =>
    ctx.rpc.call<Extract<VcsStateNodeRef, { kind: "event" }>>(
      "main",
      "vcs.mainState",
    ),
  );
  const metaRepository = await authoringStep(ctx, "resolveMetaRepository", () =>
    ctx.rpc.call<VcsResolveRepositoryResult>("main", "vcs.resolveRepository", {
      state: mainState,
      repoPath: META_REPOSITORY,
    }),
  );
  if (!metaRepository) throw new Error("Workspace meta repository disappeared");
  const meta = await authoringStep(ctx, "readMetaManifest", () =>
    ctx.rpc.call<VcsReadFileResult>("main", "vcs.readFile", {
      state: mainState,
      repositoryId: metaRepository.repositoryId,
      file: { kind: "path", path: "vibestudio.yml" },
    }),
  );
  if (!meta) throw new Error("Workspace meta/vibestudio.yml disappeared");
  const content =
    meta.content.kind === "text"
      ? meta.content.text
      : Buffer.from(meta.content.base64, "base64").toString("utf8");
  const manifest = parseTemplateManifestContent(
    content,
    parseWorkspaceSystemEpochEnvelope(content),
  );
  const runtimeTop = rootRuntimeFromTemplateManifest(manifest);
  const installation = await authoringStep(ctx, "readInstallation", () =>
    ctx.rpc.call<WorkspaceTemplateInstallation | null>(
      "main",
      "workspaceTemplateSource.readInstallation",
      { eventId: mainState.eventId },
    ),
  );
  const sources = installation?.sources ?? [];
  const templateSources = installedDependencyLayers(manifest, installation).map(
    (layer) => {
      const source = sources.find((source) => source.pin.url === layer.label);
      if (!source)
        throw new Error(`Installed dependency ${layer.label} disappeared`);
      return source.pin;
    },
  );
  if (installation?.upstream) templateSources.push(installation.upstream);
  const observation: SemanticWorkspaceObservation = {
    mainEventId: mainState.eventId,
    mainState,
    runtimeTop,
    manifest,
    installation,
    localRepoPaths: await authoringStep(ctx, "repositoryPaths", () =>
      repositoryPaths(ctx, mainState),
    ),
    templateDependencies: manifest.dependencies,
    templateSources,
  };
  ctx.log.info("Template authoring metadata observation completed", {
    templateSources: observation.templateSources.length,
    repositories: observation.localRepoPaths.size,
  });
  return observation;
}
