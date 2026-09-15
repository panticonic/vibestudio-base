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
import { WorkspaceConfigSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import type {
  WorkspaceConfig,
  WorkspaceTemplatePin,
  WorkspaceTemplateDependency,
} from "@vibestudio/workspace-contracts/types";
import type { ExtensionContextLike } from "./context.js";

export const META_REPOSITORY = "meta";
export interface SemanticWorkspaceObservation {
  mainEventId: string;
  mainState: VcsStateNodeRef;
  runtimeTop: Omit<WorkspaceConfig, "id">;
  authoredTop: Omit<WorkspaceConfig, "id">;
  manifest: ParsedTemplateManifest;
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
    const page = await ctx.rpc.call<VcsListDirectoryResult>(
      "main",
      "vcs.listDirectory",
      {
        state,
        path: directory,
        ...(cursor ? { cursor } : {}),
        limit: 500,
      },
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
  for (const root of await listDirectory(ctx, state, "")) {
    if (root.repositoryRoot) result.add(root.path);
    if (root.kind !== "directory" || root.repositoryRoot) continue;
    for (const child of await listDirectory(ctx, state, root.path))
      if (child.repositoryRoot) result.add(child.path);
  }
  return result;
}
export async function observeWorkspace(
  ctx: ExtensionContextLike,
): Promise<SemanticWorkspaceObservation> {
  const mainState = await ctx.rpc.call<
    Extract<VcsStateNodeRef, { kind: "event" }>
  >("main", "vcs.mainState");
  const info = await ctx.workspace.getInfo();
  if (!info.config)
    throw new Error("Workspace info did not expose its resolved configuration");
  const parsed = WorkspaceConfigSchema.parse({
    ...(info.config as object),
    id: info.id,
  });
  const { id: _id, ...runtimeTop } = parsed;
  const metaRepository = await ctx.rpc.call<VcsResolveRepositoryResult>(
    "main",
    "vcs.resolveRepository",
    { state: mainState, repoPath: META_REPOSITORY },
  );
  if (!metaRepository) throw new Error("Workspace meta repository disappeared");
  const meta = await ctx.rpc.call<VcsReadFileResult>("main", "vcs.readFile", {
    state: mainState,
    repositoryId: metaRepository.repositoryId,
    file: { kind: "path", path: "vibestudio.yml" },
  });
  if (!meta) throw new Error("Workspace meta/vibestudio.yml disappeared");
  const manifest = parseTemplateManifestContent(
    meta.content.kind === "text"
      ? meta.content.text
      : Buffer.from(meta.content.base64, "base64").toString("utf8"),
    runtimeTop.systemEpoch,
  );
  const sources = manifest.installation?.sources ?? [];
  const templateSources = installedDependencyLayers(manifest).map((layer) => {
    const source = sources.find((source) => source.pin.url === layer.label);
    if (!source)
      throw new Error(`Installed dependency ${layer.label} disappeared`);
    return source.pin;
  });
  if (manifest.installation?.upstream)
    templateSources.push(manifest.installation.upstream);
  return {
    mainEventId: mainState.eventId,
    mainState,
    runtimeTop: rootRuntimeFromTemplateManifest(manifest),
    authoredTop: manifest.top,
    manifest,
    localRepoPaths: await repositoryPaths(ctx, mainState),
    templateDependencies: manifest.dependencies,
    templateSources,
  };
}
