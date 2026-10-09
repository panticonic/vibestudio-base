/**
 * Publication composite over the canonical semantic VCS methods.
 *
 * It observes status once, commits the uncommitted chain when there is one,
 * and pushes the exact committed event against the observed protected main.
 * It never merges: a stale or diverged main returns a typed
 * `IntegrationRequired` result that names the comparison to review. Push keeps
 * its own build gate and publication approval; this helper only fills in the
 * values the caller would otherwise copy from status.
 */

import type {
  VcsCommitInput,
  VcsCommitResult,
  VcsCompareInput,
  VcsPushInput,
  VcsPushResult,
  VcsStatusResult,
} from "@vibestudio/service-schemas/vcs";

export interface VcsPublishInput {
  /** Context to publish; the runtime client binds its own context when omitted. */
  contextId?: string;
  /** Commit message used only when the context has uncommitted applications. */
  message?: string;
  /** Commit intent used only when the context has uncommitted applications. */
  intentSummary?: string;
}

/** Protected main is not an ancestor of the context; merge it before publishing. */
export interface VcsIntegrationRequired {
  status: "integration-required";
  code: "IntegrationRequired";
  contextId: string;
  mainRelation: "behind" | "diverged";
  mainEventId: string;
  /** Exact read-only preview of what integrating protected main brings in. */
  compare: Pick<VcsCompareInput, "target" | "source">;
}

export interface VcsPublished {
  status: "published";
  contextId: string;
  /** The commit this call made, or null when the context was already clean. */
  commit: VcsCommitResult | null;
  push: VcsPushResult;
}

export type VcsPublishResult = VcsPublished | VcsIntegrationRequired;

/** The three calls publication composes; command identities are bound by the client. */
export interface VcsPublicationClient {
  status(input: { contextId: string }): Promise<VcsStatusResult>;
  commit(input: Omit<VcsCommitInput, "commandId">): Promise<VcsCommitResult>;
  push(input: Omit<VcsPushInput, "commandId">): Promise<VcsPushResult>;
}

/** Status-derived publication precondition shared by every publishing caller. */
export function publicationIntegrationRequired(
  status: VcsStatusResult
): VcsIntegrationRequired | null {
  if (status.mainRelation !== "behind" && status.mainRelation !== "diverged") return null;
  return {
    status: "integration-required",
    code: "IntegrationRequired",
    contextId: status.contextId,
    mainRelation: status.mainRelation,
    mainEventId: status.mainEventId,
    compare: {
      target: status.workingHead,
      source: { kind: "event", eventId: status.mainEventId },
    },
  };
}

export async function publishContext(
  vcs: VcsPublicationClient,
  input: VcsPublishInput & { contextId: string }
): Promise<VcsPublishResult> {
  const status = await vcs.status({ contextId: input.contextId });
  const integration = publicationIntegrationRequired(status);
  if (integration) return integration;
  let commit: VcsCommitResult | null = null;
  let committedEventId = status.committed.eventId;
  if (!status.clean) {
    commit = await vcs.commit({
      contextId: input.contextId,
      expectedWorkingHead: status.workingHead,
      ...(input.message ? { message: input.message } : {}),
      ...(input.intentSummary ? { intentSummary: input.intentSummary } : {}),
    });
    if (commit.event.kind !== "event") throw new Error("vcs commit returned a non-event state");
    committedEventId = commit.event.eventId;
  }
  const push = await vcs.push({
    contextId: input.contextId,
    expectedCommittedEventId: committedEventId,
    expectedMainEventId: status.mainEventId,
  });
  return { status: "published", contextId: input.contextId, commit, push };
}
