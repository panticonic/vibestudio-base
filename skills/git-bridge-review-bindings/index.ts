import { isDeepStrictEqual } from "node:util";
import { contextId, git, vcs } from "@workspace/runtime";
import type {
  GitBridgeRequest,
  GitBridgeView,
} from "../git-bridge-review/types.js";

/** Bind one repository lookup to the caller's semantic context. */
export function bindGitBridgeReview(
  input: Omit<GitBridgeRequest, "operationId">,
) {
  const request: GitBridgeRequest = {
    ...input,
    operationId: crypto.randomUUID(),
  };
  const { operationId, repository } = request;
  return {
    request,
    services: {
      gitBridgeReviewRead: {
        async observe(id: string): Promise<GitBridgeView> {
          if (id !== operationId)
            throw new Error("Observe only the assigned Git Bridge repository");
          const before = await vcs.status();
          if (before.contextId !== contextId)
            throw new Error("Git Bridge review belongs to a different context");
          const main = { kind: "event", eventId: before.mainEventId } as const;
          const protectedRead = vcs.resolveRepository({
            state: main,
            repoPath: repository,
          });
          const [rows, workingRepository, mainRepository] = await Promise.all([
            git.upstreamStatus([repository]),
            isDeepStrictEqual(before.workingHead, main)
              ? protectedRead
              : vcs.resolveRepository({
                  state: before.workingHead,
                  repoPath: repository,
                }),
            protectedRead,
          ]);
          const [upstream] = rows;
          if (rows.length !== 1 || upstream?.repoPath !== repository)
            throw new Error("The Git Bridge returned a different repository");
          const after = await vcs.status();
          if (after.contextId !== contextId)
            throw new Error("Git Bridge review belongs to a different context");
          const observation =
            upstream.observedAt !== undefined &&
            upstream.remoteBranchExists !== undefined
              ? {
                  at: upstream.observedAt,
                  branchExists: upstream.remoteBranchExists,
                  relationship: upstream.relationship ?? null,
                  ahead: upstream.aheadBy ?? null,
                  behind: upstream.behindBy ?? null,
                }
              : null;
          return {
            repository,
            upstream: {
              state: upstream.state,
              remote: upstream.remote ?? null,
              branch: upstream.branch ?? null,
              autoPush: upstream.autoPush,
              candidate: upstream.candidate ?? null,
              observation,
            },
            semantic: {
              contextId: before.contextId,
              current: isDeepStrictEqual(before, after),
              mainEventId: before.mainEventId,
              working: before.workingHead,
              clean: before.clean,
              relation: before.mainRelation,
              workingRepositoryId: workingRepository?.repositoryId ?? null,
              mainRepositoryId: mainRepository?.repositoryId ?? null,
            },
          };
        },
      },
    },
  };
}
