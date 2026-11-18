import type {
  DefectClass,
  Evidence,
  FrozenReport,
  ProblemEvidenceReceipt,
  ProblemNext,
  ProblemRequest,
  ProblemReviewReport,
  ReportRevision,
} from "../problem-reporting/natlang/types.js";

const draft: ReportRevision = {
  id: "report-7",
  revision: 9,
  basisRevision: 9,
  userEdits: false,
};
const frozen: FrozenReport = {
  revision: 9,
  digest: "sha256:test-09",
  sanitized: true,
  approval: "none",
};
const platform: Evidence = {
  goal: "Open a pinned message preview",
  observed:
    "A host panic interrupted a documented successful preview at the current revision.",
  expected: "Render the saved message",
  operation: "panels.preview",
  attempts: "Repeated with the same immutable artifact.",
  reproduced: true,
};
const workspaceError: Evidence = {
  goal: "Build a workspace worker",
  observed: "My worker used unknown generic CacheValue in workers/index.ts.",
  expected: "Build cleanly",
  operation: "build.report",
  attempts: "Source check found the missing alias.",
  reproduced: true,
};
const refusal: Evidence = {
  goal: "Try an operation requiring a reviewed basis",
  observed:
    "The platform refused the operation because the working head no longer matches the supplied revision.",
  expected: "Reject a stale revision",
  operation: "vcs.write",
  attempts: "No new basis applied yet.",
  reproduced: true,
};
const transient: Evidence = {
  goal: "Observe workspace readiness",
  observed:
    "A single gateway timeout occurred; repeating the same check succeeded.",
  expected: "Return a readiness snapshot",
  operation: null,
  attempts: "Second check returned normally.",
  reproduced: false,
};
const receipt = (
  id: string,
  kind: ProblemEvidenceReceipt["kind"],
  state: ProblemEvidenceReceipt["state"],
  selected = true,
): ProblemEvidenceReceipt => ({ id, kind, state, selected });

function task(
  id: string,
  group: string,
  goal: string,
  patch: Partial<ProblemRequest>,
  defect: DefectClass,
  next: ProblemNext,
  selected: string[] = [],
  incomplete: string[] = [],
) {
  const request: ProblemRequest = {
    goal,
    consent: "unspecified",
    account: platform,
    evidence: [],
    draft: null,
    frozen: null,
    ...patch,
  };
  const expected: ProblemReviewReport = {
    defect,
    next,
    basis: request.draft?.id ?? null,
    evidence: {
      selected,
      incomplete,
      attribution: request.account.reproduced ? "observed" : "unverified",
    },
  };
  return {
    id: `problem-${id}`,
    sourceGroup: `vibestudio:problem-reporting:${group}`,
    request,
    expected,
  };
}

export const problemReviewWorlds = [
  task(
    "host-panic-local",
    "platform-prepare",
    "Review the reproducible preview failure and preserve the evidence.",
    {},
    "platform",
    "prepare-local-draft",
  ),
  task(
    "user-account-not-reproduced",
    "attribution",
    "The reporter saw the host ignore the documented close result. Assess the report as their account.",
    {
      account: {
        ...platform,
        reproduced: false,
        attempts: "None in this session.",
      },
      evidence: [receipt("user-msg", "message", "observed")],
    },
    "platform",
    "prepare-local-draft",
    ["user-msg"],
  ),
  task(
    "recovered-platform-case",
    "platform-prepare",
    "A wrong documented preview result eventually recovered. Keep the host observation available.",
    {
      account: {
        ...platform,
        observed:
          "The host incorrectly returned another authorized preview revision twice with a valid request; after restart it returned the right revision.",
      },
    },
    "platform",
    "prepare-local-draft",
  ),
  task(
    "one-draft-for-issue",
    "revision-ownership",
    "Continue the existing report for this host defect.",
    { draft },
    "platform",
    "continue-local-draft",
  ),
  task(
    "unknown-alias-is-user-code",
    "defect-distinction",
    "Explain my worker's type failure before escalating anything.",
    { account: workspaceError },
    "user-code",
    "continue-user-task",
  ),
  task(
    "stale-head-intended-refusal",
    "defect-distinction",
    "Was a protected workspace update rejected due to a bug?",
    { account: refusal },
    "refusal",
    "continue-user-task",
  ),
  task(
    "transient-recovered",
    "defect-distinction",
    "Inspect the one-off probe error after the normal retry succeeded.",
    { account: transient },
    "transient",
    "continue-user-task",
  ),
  task(
    "denied-action-is-not-defect",
    "defect-distinction",
    "Explain an expected approval denial reported in the receipt.",
    {
      account: {
        ...refusal,
        observed:
          "The owning user denied the approval and the invocation stopped without any effect.",
      },
    },
    "refusal",
    "continue-user-task",
  ),
  task(
    "report-workspace-code-on-request",
    "explicit-scope",
    "Please save a local problem record for my own worker's compiler error.",
    { consent: "save", account: workspaceError },
    "user-code",
    "prepare-local-draft",
  ),
  task(
    "explicit-transient-sharing",
    "explicit-scope",
    "I explicitly want to submit this recovered incident with my selected account.",
    { consent: "share", account: transient, draft },
    "transient",
    "freeze-selected-report",
  ),
  task(
    "explicit-refusal-save-existing",
    "explicit-scope",
    "Keep this permission experience in my existing local report.",
    { consent: "save", account: refusal, draft },
    "refusal",
    "keep-local",
  ),
  task(
    "no-report-even-for-platform",
    "consent",
    "Please continue fixing my problem without preparing a report.",
    { consent: "decline" },
    "platform",
    "continue-user-task",
  ),
  task(
    "no-report-with-existing",
    "consent",
    "I no longer want to share or edit the existing draft for this report.",
    { consent: "decline", draft, frozen: { ...frozen, approval: "approved" } },
    "platform",
    "continue-user-task",
  ),
  task(
    "save-only-by-existing-id",
    "consent",
    "Keep the draft for the documented host error on this device only.",
    { consent: "save", draft },
    "platform",
    "keep-local",
  ),
  task(
    "stale-edit-basis",
    "revision-ownership",
    "Append my short observation after I edited the report myself.",
    { consent: "save", draft: { ...draft, basisRevision: 8, userEdits: true } },
    "platform",
    "refresh-own-edit",
  ),
  task(
    "stale-basis-before-freeze",
    "revision-ownership",
    "I asked to share the report before a recent user revision moved. Prepare the right next step.",
    {
      consent: "share",
      draft: { ...draft, revision: 12, basisRevision: 9, userEdits: true },
    },
    "platform",
    "refresh-own-edit",
  ),
  task(
    "report-diagnostics-expired",
    "selected-evidence",
    "Use only the selected invocation and build evidence, and explain what expired.",
    {
      evidence: [
        receipt("build-1", "build", "expired"),
        receipt("invoke-4", "invocation", "observed"),
      ],
    },
    "platform",
    "prepare-local-draft",
    ["invoke-4"],
    ["build-1"],
  ),
  task(
    "report-receipt-selection-order",
    "selected-evidence",
    "Use the two selected observations in read order and track the unavailable message.",
    {
      evidence: [
        receipt("panel-31", "panel", "observed"),
        receipt("context-note", "message", "unavailable"),
        receipt("compile-20", "build", "observed"),
      ],
    },
    "platform",
    "prepare-local-draft",
    ["panel-31", "compile-20"],
    ["context-note"],
  ),
  task(
    "deny-and-unselected-omission",
    "selected-evidence",
    "Only the selected invocation is in scope, and it was denied; do not substitute the panel.",
    {
      evidence: [
        receipt("invoke-gated", "invocation", "denied"),
        receipt("unused-panel", "panel", "observed", false),
      ],
    },
    "platform",
    "prepare-local-draft",
    [],
    ["invoke-gated"],
  ),
  task(
    "expired-unselected-not-gap",
    "selected-evidence",
    "The selected build observation is enough. The old invocation is outside the report selection.",
    {
      evidence: [
        receipt("old-unselected", "invocation", "expired", false),
        receipt("new-build", "build", "observed"),
      ],
    },
    "platform",
    "prepare-local-draft",
    ["new-build"],
  ),
  task(
    "actual-log-unverified-original",
    "attribution",
    "The user describes a bad result; a selected diagnostic describes our current observation but the original was never reproduced.",
    {
      account: { ...platform, reproduced: false },
      evidence: [receipt("invocation-own", "invocation", "observed")],
    },
    "platform",
    "prepare-local-draft",
    ["invocation-own"],
  ),
  task(
    "share-needs-current-draft-first",
    "freeze-identity",
    "Send this report after review. There is still no local draft.",
    { consent: "share" },
    "platform",
    "prepare-local-draft",
  ),
  task(
    "share-existing-must-freeze",
    "freeze-identity",
    "Prepare to submit the current saved report.",
    { consent: "share", draft },
    "platform",
    "freeze-selected-report",
  ),
  task(
    "approved-current-sanitized",
    "freeze-identity",
    "Check if the concrete approval can apply to the current frozen report.",
    { consent: "share", draft, frozen: { ...frozen, approval: "approved" } },
    "platform",
    "ready-to-submit",
  ),
  task(
    "older-approval-stale",
    "freeze-identity",
    "An approval for older bytes exists, but the user saved a newer draft before submission.",
    {
      consent: "share",
      draft: { ...draft, revision: 10, basisRevision: 10 },
      frozen: { ...frozen, approval: "approved" },
    },
    "platform",
    "freeze-selected-report",
  ),
  task(
    "no-digest-frozen-metadata",
    "freeze-identity",
    "The UI shows a revision but the receipt has no digest. Is it ready for the requested send?",
    {
      consent: "share",
      draft,
      frozen: { ...frozen, digest: "", approval: "approved" },
    },
    "platform",
    "freeze-selected-report",
  ),
  task(
    "unsanitized-with-approval",
    "freeze-identity",
    "The sanitized snapshot was never recorded. Review if an old approval is enough.",
    {
      consent: "share",
      draft,
      frozen: { ...frozen, sanitized: false, approval: "approved" },
    },
    "platform",
    "freeze-selected-report",
  ),
  task(
    "approved-target-yet-awaiting",
    "submission-approval",
    "The frozen snapshot is ready; the one-time approval is still open.",
    { consent: "share", draft, frozen: { ...frozen, approval: "pending" } },
    "platform",
    "wait-for-approval",
  ),
  task(
    "share-no-approval",
    "submission-approval",
    "Confirm what is missing when explicit reporting intent is on record and no approval has been issued.",
    { consent: "share", draft, frozen },
    "platform",
    "wait-for-approval",
  ),
  task(
    "denied-stops",
    "submission-approval",
    "Summarize the exact user's decision on the proposed submission.",
    { consent: "share", draft, frozen: { ...frozen, approval: "denied" } },
    "platform",
    "submission-stopped",
  ),
  task(
    "dismissed-stops",
    "submission-approval",
    "The user dismissed the approval. Assess the receipt without repeating the prompt.",
    { consent: "share", draft, frozen: { ...frozen, approval: "dismissed" } },
    "platform",
    "submission-stopped",
  ),
  task(
    "approval-save-does-not-send",
    "submission-approval",
    "Keep the report locally although a previous frozen revision was approved.",
    { consent: "save", draft, frozen: { ...frozen, approval: "approved" } },
    "platform",
    "keep-local",
  ),
];
export type ProblemWorld = (typeof problemReviewWorlds)[number];
