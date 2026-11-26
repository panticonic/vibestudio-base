import { sha256Hex, sha256HexSyncText, stableSha256Hex } from "@vibestudio/content-addressing";
import type { VcsStateNodeRef } from "@vibestudio/service-schemas/vcs";
import { contextId, fs, vcs } from "@workspace/runtime";
import { prepareUnitIcon, setUnitIcon } from "@workspace-skills/workspace-dev";
import { IconNotInCatalog, resolveIcon } from "../workspace-dev/natlang/catalog.js";
import type {
  IconIntent,
  UnitIdentityCandidate,
  UnitIdentityChange,
  UnitIdentityRequest,
} from "../workspace-dev/natlang/types.js";

type Assignment = Omit<UnitIdentityRequest, "operationId"> & { repoPath: string };
const revisionId = (workingHead: VcsStateNodeRef): string =>
  workingHead.kind === "event" ? workingHead.eventId : workingHead.applicationId;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The unit requires an object manifest and Vibestudio metadata");
  return value as Record<string, unknown>;
}

export function bindUnitIdentity(input: Assignment) {
  const { repoPath, unit, goal, prepare } = structuredClone(input);
  if (!contextId || !goal.trim() || !/^(about|panels|workers|clients|extensions)\/[^/]+$/u.test(repoPath))
    throw new Error("Assign one existing executable unit in the current context");
  const request: UnitIdentityRequest = { operationId: crypto.randomUUID(), goal, unit, prepare };
  let baseline: Promise<Awaited<ReturnType<typeof snapshot>>> | undefined;
  const resolved = new Map<string, UnitIdentityCandidate>();
  let staged = false;

  async function snapshot() {
    const status = await vcs.status({ contextId });
    const state = status.workingHead;
    const repository = await vcs.resolveRepository({ state, repoPath });
    if (!repository) throw new Error("The assigned unit is outside this working state");
    const read = (path: string) => vcs.readFile({
      state, repositoryId: repository.repositoryId, file: { kind: "path", path },
    });
    const file = await read("package.json");
    if (file?.content.kind !== "text") throw new Error("The assigned unit has no text manifest");
    const manifest = record(JSON.parse(file.content.text));
    const { icon: stored, ...otherMetadata } = record(manifest["vibestudio"]);
    const icon = typeof stored === "string" ? stored : null;
    const artwork = icon?.startsWith("./") ? await read(icon.slice(2)) : null;
    const artworkDigest = !artwork ? null : artwork.content.kind === "text"
      ? sha256HexSyncText(artwork.content.text)
      : sha256Hex(Uint8Array.from(atob(artwork.content.base64), (c) => c.charCodeAt(0)));
    return {
      status,
      manifestDigest: stableSha256Hex({ ...manifest, vibestudio: otherMetadata }),
      observation: { repoPath, revision: revisionId(state), icon, artworkDigest },
    };
  }

  async function candidate(intent: IconIntent): Promise<UnitIdentityCandidate | null> {
    if (!(["brand", "lucide", "emoji"] as const).includes(intent?.family) ||
      typeof intent.term !== "string" || !intent.term.length || intent.term.length > 120)
      return null;
    try {
      const choice = await resolveIcon(intent, fs);
      const prepared = await prepareUnitIcon(choice.id);
      if (!prepared.icon) return null;
      const text = prepared.files["assets/icon.svg"];
      return {
        choice,
        declaration: prepared.icon,
        artworkDigest: text === undefined ? null : sha256HexSyncText(text),
      };
    } catch (error) {
      if (error instanceof IconNotInCatalog) return null;
      throw error;
    }
  }

  function verifyId(id: string) {
    if (id !== request.operationId) throw new Error("Use the caller's assigned unit identity operation");
  }

  return {
    request,
    services: {
      unitIdentity: {
        async observe(id: string) {
          verifyId(id);
          const current = await snapshot();
          // Reads stay fresh; a later observation never renews the original
          // mutation authority or its compare-and-swap baseline.
          baseline ??= Promise.resolve(current);
          return structuredClone(current.observation);
        },
        async resolve(id: string, intent: IconIntent) {
          verifyId(id);
          const choice = await candidate(intent);
          if (choice) resolved.set(choice.choice.id, structuredClone(choice));
          return structuredClone(choice);
        },
        async stage(id: string, revision: string, authoringId: string): Promise<UnitIdentityChange> {
          verifyId(id);
          const original = await baseline;
          const chosen = resolved.get(authoringId);
          if (!prepare || !original || !chosen || staged || original.observation.revision !== revision ||
            chosen.choice.id !== authoringId ||
            (original.observation.icon === chosen.declaration && original.observation.artworkDigest === chosen.artworkDigest))
            throw new Error("Prepare only a changed, resolved icon at the caller's assigned revision");
          staged = true;
          try {
            const change = await setUnitIcon({
              repoPath, icon: authoringId, expectedWorkingHead: original.status.workingHead,
            });
            const after = await snapshot();
            if (after.observation.revision !== revisionId(change.preparation.workingHead) || !after.observation.icon)
              throw new Error("The working state changed before icon verification");
            return {
              repoPath,
              revision: after.observation.revision,
              icon: after.observation.icon,
              artworkDigest: after.observation.artworkDigest,
              mainUnchanged: after.status.mainEventId === original.status.mainEventId,
              manifestOtherwiseUnchanged: after.manifestDigest === original.manifestDigest,
              changedFiles: change.files,
            };
          } catch (error) {
            // An uncommitted IO failure is retryable. If the edit committed
            // before verification failed, the original VCS CAS still refuses
            // a second mutation at that old head.
            staged = false;
            throw error;
          }
        },
      },
    },
  };
}
