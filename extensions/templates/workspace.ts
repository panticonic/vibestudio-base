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
  type ParsedTemplateManifest,
} from "@vibestudio/workspace/templateManifest";
import { readWorkspaceConfig } from "@vibestudio/workspace/configParser";
import type {
  WorkspaceConfig,
  WorkspaceTemplatePin,
  WorkspaceTemplateDependency,
  WorkspaceTemplateInstallation,
} from "@vibestudio/workspace-contracts/types";
import type { ExtensionContextLike } from "./context.js";

export const META_REPOSITORY = "meta";
export interface SemanticWorkspaceObservation {
  mainEventId: string;
  mainState: VcsStateNodeRef;
  runtimeTop: Omit<WorkspaceConfig, "id">;
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
  const content =
    meta.content.kind === "text"
      ? meta.content.text
      : Buffer.from(meta.content.base64, "base64").toString("utf8");
  const config = await readWorkspaceConfig(
    {
      readText: async (filePath) => {
        if (filePath === "meta/vibestudio.yml") return content;
        const repoPath = filePath.slice(0, -"/package.json".length);
        const repo = await ctx.rpc.call<VcsResolveRepositoryResult>(
          "main",
          "vcs.resolveRepository",
          { state: mainState, repoPath },
        );
        if (!repo) return null;
        const file = await ctx.rpc.call<VcsReadFileResult>(
          "main",
          "vcs.readFile",
          {
            state: mainState,
            repositoryId: repo.repositoryId,
            file: { kind: "path", path: "package.json" },
          },
        );
        return !file
          ? null
          : file.content.kind === "text"
            ? file.content.text
            : Buffer.from(file.content.base64, "base64").toString("utf8");
      },
    },
    info.id,
  );
  const { id: _id, ...runtimeTop } = config;
  const manifest = parseTemplateManifestContent(
    content,
    runtimeTop.systemEpoch,
  );
  const installation = await ctx.rpc.call<WorkspaceTemplateInstallation | null>(
    "main",
    "workspaceTemplateSource.readInstallation",
    { eventId: mainState.eventId },
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
  return {
    mainEventId: mainState.eventId,
    mainState,
    runtimeTop,
    manifest,
    installation,
    localRepoPaths: await repositoryPaths(ctx, mainState),
    templateDependencies: manifest.dependencies,
    templateSources,
  };
}
