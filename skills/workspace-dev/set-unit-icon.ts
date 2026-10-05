import { contextId, vcs } from "@workspace/runtime";
import {
  vcsResolveRepositoryInputSchema,
  type VcsEditChange,
} from "@vibestudio/service-schemas/vcs";
import { MAX_UNIT_ICON_BYTES } from "@vibestudio/shared/panel/icon";
import { prepareUnitIcon } from "./unit-icons.js";
import {
  prepareChanges,
  type ProjectPreparation,
} from "./project-preparation.js";

export interface SetUnitIconParams {
  /** Exact workspace repository, e.g. panels/inbox or apps/mobile. */
  repoPath: string;
  /** Catalog ID, one emoji, or an existing unit-relative image path. */
  icon: string;
}

export interface SetUnitIconResult {
  repoPath: string;
  icon: string;
  files: string[];
  preparation: ProjectPreparation;
}

/** Prepare an identity change atomically. Review, verify and publish separately. */
export async function setUnitIcon({
  repoPath,
  icon,
}: SetUnitIconParams): Promise<SetUnitIconResult> {
  if (!/^(about|panels|workers|apps|extensions)\/[^/]+$/u.test(repoPath)) {
    throw new Error(
      "setUnitIcon requires an exact executable unit repository path",
    );
  }
  const prepared = await prepareUnitIcon(icon);
  if (!prepared.icon) throw new Error("setUnitIcon requires an icon");
  const status = await vcs.status({ contextId });
  const repository = await vcs.resolveRepository(
    vcsResolveRepositoryInputSchema.parse({
      state: status.workingHead,
      repoPath,
    }),
  );
  if (!repository) throw new Error(`Unit repository not found: ${repoPath}`);
  const read = (path: string) =>
    vcs.readFile({
      state: status.workingHead,
      repositoryId: repository.repositoryId,
      file: { kind: "path", path },
    });
  const file = await read("package.json");
  if (!file || file.content.kind !== "text")
    throw new Error(`${repoPath}/package.json must be a text manifest`);
  const manifest = JSON.parse(file.content.text);
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    !manifest.vibestudio ||
    typeof manifest.vibestudio !== "object" ||
    Array.isArray(manifest.vibestudio)
  ) {
    throw new Error(
      `${repoPath}/package.json must declare vibestudio metadata`,
    );
  }
  if (prepared.icon.startsWith("./") && !Object.keys(prepared.files).length) {
    const asset = await read(prepared.icon.slice(2));
    if (!asset)
      throw new Error(
        `Icon asset not found: ${repoPath}/${prepared.icon.slice(2)}`,
      );
    const bytes =
      asset.content.kind === "text"
        ? new TextEncoder().encode(asset.content.text).byteLength
        : atob(asset.content.base64).length;
    if (bytes > MAX_UNIT_ICON_BYTES)
      throw new Error(`Icon asset exceeds ${MAX_UNIT_ICON_BYTES} bytes`);
  }
  manifest.vibestudio.icon = prepared.icon;
  const changes: VcsEditChange[] = [
    {
      kind: "text-edit",
      repositoryId: file.repositoryId,
      fileId: file.fileId,
      edits: [
        {
          start: 0,
          end: file.content.text.length,
          text: `${JSON.stringify(manifest, null, 2)}\n`,
        },
      ],
    },
  ];
  for (const [path, text] of Object.entries(prepared.files)) {
    const existing = await read(path);
    changes.push(
      existing
        ? {
            kind: "content-replace",
            repositoryId: existing.repositoryId,
            fileId: existing.fileId,
            content: { kind: "text", text },
          }
        : {
            kind: "file-create",
            repositoryId: repository.repositoryId,
            path,
            content: { kind: "text", text },
            mode: 0o644,
          },
    );
  }
  const preparation = await prepareChanges(
    changes,
    `Set icon for ${repoPath}`,
    status,
  );
  return {
    repoPath,
    icon: prepared.icon,
    files: ["package.json", ...Object.keys(prepared.files)],
    preparation,
  };
}
