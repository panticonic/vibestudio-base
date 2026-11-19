import { isDeepStrictEqual } from "node:util";
import { contextId, vcs } from "@workspace/runtime";
import type {
  VcsDeliveryRequest,
  VcsDeliverySnapshot,
  VcsDeliveryState,
  VcsDeliveryVersion,
} from "../vibestudio-vcs/natlang/types.js";

const EXCERPT_CHARS = 2500;

async function readAssignedVersion(
  state: VcsDeliveryState,
  repoPath: string,
  path: string,
): Promise<VcsDeliveryVersion | null> {
  const repo = await vcs.resolveRepository({ state, repoPath });
  if (!repo) return null;
  const file = await vcs.readFile({
    state,
    repositoryId: repo.repositoryId,
    file: { kind: "path", path },
  });
  if (!file) return null;
  const text = file.content.kind === "text" ? file.content.text : null;
  return {
    fileId: file.fileId,
    hash: file.contentHash,
    mode: file.mode,
    excerpt: text?.slice(0, EXCERPT_CHARS) ?? null,
    truncated: text !== null && text.length > EXCERPT_CHARS,
  };
}

function differs(
  left: VcsDeliveryVersion | null,
  right: VcsDeliveryVersion | null,
) {
  return (
    left?.fileId !== right?.fileId ||
    left?.hash !== right?.hash ||
    left?.mode !== right?.mode
  );
}

/** Expose only the caller-assigned semantic file, from the bound context. */
export function bindVcsDelivery(
  input: Omit<VcsDeliveryRequest, "operationId">,
) {
  const request = { ...input, operationId: crypto.randomUUID() };
  const { operationId, repository, path } = request;
  return {
    request,
    services: {
      vcsDeliveryRead: {
        async observe(id: string): Promise<VcsDeliverySnapshot> {
          if (id !== operationId)
            throw new Error("Read only the assigned semantic VCS file");
          const before = await vcs.status();
          if (before.contextId !== contextId)
            throw new Error(
              "VCS delivery status belongs to a different context",
            );
          const protectedMain = {
            kind: "event",
            eventId: before.mainEventId,
          } as const;
          const read = (state: VcsDeliveryState) =>
            readAssignedVersion(state, repository, path);
          const mainRead = read(protectedMain);
          const committedRead =
            before.committed.eventId === before.mainEventId
              ? mainRead
              : read(before.committed);
          const [working, committed, main] = await Promise.all([
            before.workingHead.kind === "event" &&
            before.workingHead.eventId === before.committed.eventId
              ? committedRead
              : read(before.workingHead),
            committedRead,
            mainRead,
          ]);
          const after = await vcs.status();
          if (after.contextId !== contextId)
            throw new Error(
              "VCS delivery status belongs to a different context",
            );
          return {
            contextId: before.contextId,
            current: isDeepStrictEqual(before, after),
            clean: before.clean,
            relation: before.mainRelation,
            working: before.workingHead,
            committed: before.committed,
            protectedMain,
            integrations: before.integrating.map((row) => ({
              source: row.source,
              remaining: row.remainingCoordinateCount,
              conflicts: row.conflictCoordinateCount,
              concluded: row.concluded,
              stale: row.stale,
            })),
            file: {
              path,
              working,
              committed,
              protectedMain: main,
              hasLocalDifference: differs(working, committed),
              hasDeliveryDifference: differs(working, main),
            },
          };
        },
      },
    },
  };
}
