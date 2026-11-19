import type {
  TemplateUpdateReview,
  TemplateUpdateStatus,
  TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import type {
  CandidateOffer,
  CandidateRequest,
  CandidateReview,
  CandidateState,
  StageReceipt,
} from "../template-candidate/types.js";

type TemplateLifecycle = Pick<
  TemplatesClient,
  "updateStatus" | "prepareUpdate" | "reviewUpdate"
>;

export function bindTemplateCandidate(
  templates: TemplateLifecycle,
  mainEvent: () => Promise<string>,
  assignment: CandidateRequest,
) {
  const {
    intent,
    sourceUrl,
    installedCommit,
    incomingCommit,
    checkedAfterMs,
    commandId,
  } = assignment;
  if (
    !sourceUrl ||
    !commandId ||
    !Number.isSafeInteger(checkedAfterMs) ||
    !/^[a-f0-9]{40}$/u.test(installedCommit) ||
    !/^[a-f0-9]{40}$/u.test(incomingCommit)
  )
    throw new Error(
      "Bind an exact template source, the reviewed commits, and a durable command ID.",
    );

  let claimed = false;
  let attempted = false;

  async function selection() {
    const state: TemplateUpdateStatus = await templates.updateStatus();
    const checks = state.checks.filter(
      (check) => check.source.url === sourceUrl,
    );
    if (checks.length !== 1) return null;
    const check = checks[0]!;
    if (check.target && check.target.url !== sourceUrl) return null;
    return { state, check };
  }

  function project(review: TemplateUpdateReview): CandidateReview | null {
    if (
      review.operationId !== commandId ||
      review.sourceUrl !== sourceUrl ||
      review.target.url !== sourceUrl ||
      review.target.commit !== incomingCommit ||
      !review.contextId ||
      !review.mainEventId
    )
      return null;
    return {
      operationId: review.operationId,
      contextId: review.contextId,
      mainEventId: review.mainEventId,
      incomingCommit: review.target.commit,
      state: review.status,
      repositories: review.repositories.map(({ repoPath, kind }) => ({
        repoPath,
        kind,
      })),
      conflicts: review.conflicts.map(({ deltaId, repoPath, coordinate }) => ({
        deltaId,
        repoPath,
        kind: coordinate.coordinate.kind,
        id: coordinate.coordinate.id,
      })),
    };
  }

  return {
    templateOffer: {
      async read(): Promise<CandidateOffer | null> {
        const selected = await selection().catch(() => null);
        if (!selected) return null;
        const { state, check } = selected;
        return {
          installedCommit: check.source.commit,
          incomingCommit: check.target?.commit ?? null,
          status: check.status,
          checkedAt: check.checkedAt,
          workspaceAppVersion: state.workspaceAppVersion,
          currentAppVersion: state.currentAppVersion,
          targetAppVersion: check.targetAppVersion ?? null,
          minimumAppVersion: check.targetMinimumAppVersion ?? null,
          hostUnavailable: Boolean(check.hostError),
        };
      },
    },
    templateCandidatePrepare: {
      async prepare(): Promise<StageReceipt> {
        if (claimed || intent !== "stage")
          return { outcome: "offer-changed", review: null };
        claimed = true;
        const selected = await selection().catch(() => null);
        const check = selected?.check;
        if (
          !selected ||
          !check?.target ||
          check.status !== "available" ||
          check.hostError ||
          check.targetEpoch !== selected.state.workspaceEpoch ||
          check.source.commit !== installedCommit ||
          check.target.commit !== incomingCommit ||
          check.checkedAt < checkedAfterMs ||
          check.target.commit === check.source.commit
        )
          return { outcome: "offer-changed", review: null };

        attempted = true;
        try {
          const result = await templates.prepareUpdate({
            commandId,
            sourceUrl,
            target: check.target,
          });
          const review = project(result);
          if (review) return { outcome: "acknowledged", review };
        } catch {
          // The command may already have a partial durable operation.
        }
        return { outcome: "unconfirmed", review: null };
      },
    },
    templateCandidateReview: {
      async read(): Promise<CandidateState | null> {
        if (!attempted) return null;
        try {
          const review = project(
            await templates.reviewUpdate({ operationId: commandId }),
          );
          if (review)
            return { review, mainEventId: await mainEvent().catch(() => null) };
        } catch {
          // Review can be unavailable even when the prepare request was acknowledged.
        }
        return null;
      },
    },
  };
}
