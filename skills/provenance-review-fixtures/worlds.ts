import type {
  AttributionReceipt,
  ProvenanceFact,
  ProvenanceMechanism,
  ProvenanceReport,
  ProvenanceRequest,
} from "../provenance-orientation/types.js";

function task(
  id: string,
  group: string,
  request: ProvenanceRequest,
  expected: ProvenanceReport,
) {
  return {
    id: `provenance-${id}`,
    sourceGroup: `vibestudio:provenance:${group}`,
    request,
    expected,
  };
}
function route(
  id: string,
  goal: string,
  mechanism: ProvenanceMechanism,
  memoryInstalled = true,
  attachedReadSufficient = false,
) {
  return task(
    id,
    `route-${mechanism}`,
    { kind: "route", goal, memoryInstalled, attachedReadSufficient },
    { kind: "route", mechanism },
  );
}
function who(
  id: string,
  goal: string,
  origin: AttributionReceipt["origin"],
  patch: Partial<AttributionReceipt>,
  references: string[],
) {
  const receipt = {
    origin,
    actor: null,
    sourceRef: null,
    sourceRevision: null,
    decisionRef: null,
    actionRef: "@action-71",
    statedIntentRef: null,
    visibleBoundary: null,
    ...patch,
  };
  return task(
    id,
    `origin-${origin}`,
    { kind: "attribution", goal, receipt },
    {
      kind: "attribution",
      origin,
      references,
      supportedIntent: receipt.statedIntentRef,
      boundary: receipt.visibleBoundary,
    },
  );
}
function observed(
  ref: string,
  kind: ProvenanceFact["kind"],
  summary: string,
  tier: ProvenanceFact["tier"] = "stated",
  disclosed = true,
): ProvenanceFact {
  return { ref, kind, summary, tier, disclosed };
}
function constraint(
  id: string,
  group: string,
  goal: string,
  proposedProperty: string,
  evidence: ProvenanceFact[],
  status: Extract<ProvenanceReport, { kind: "constraint" }>["status"],
  refs: string[],
  boundary: "too-broad" | "outside-visibility" | "pruned" | "none" = "none",
) {
  return task(
    id,
    group,
    {
      kind: "constraint",
      goal,
      proposedProperty,
      evidence: evidence.filter((fact) => fact.disclosed),
      boundary,
    },
    { kind: "constraint", status, evidence: refs },
  );
}

export const provenanceReviewWorlds = [
  route(
    "reuse-read-attachment",
    "I just read the sidebar's drawer and the attached observation explains why these exact bytes are there. Which read would you use?",
    "attached-read",
    true,
    true,
  ),
  route(
    "incomplete-attachment-seek-cause",
    "The managed read attached the edit coordinate but not why this named drawer change was requested. Find the reason behind the change.",
    "cause",
  ),
  route(
    "named-change-task",
    "Recover the human request that originally led to @r9-ac18.",
    "cause",
  ),
  route(
    "same-turn-neighbors",
    "Which other coordinates did the same work unit touch when it changed the panel's refresh behavior?",
    "cohort",
  ),
  route(
    "prior-attempt-reversed",
    "Before we enlarge the drain window, find whether something equivalent was tried and undone.",
    "rejections",
  ),
  route(
    "two-merge-decisions",
    "Check whether these two named merge decisions came from the same request.",
    "relate",
  ),
  route(
    "coordinate-intent-evolution",
    "Show how the meaning of this timeout coordinate changed across its revisions.",
    "blame",
  ),
  route(
    "description-without-coordinate",
    "Find the change that addressed the unread badge, but I don't know which file it affected.",
    "search",
  ),
  route(
    "name-in-private-history",
    "Find the old record mentioning the beta fleet codename that no current file holds.",
    "memory-recall",
  ),
  route(
    "name-with-personal-uninstalled",
    "I remember a mention of the call queue codename and no file names it. This is a System workspace without Personal memory.",
    "search",
    false,
  ),
  route(
    "find-all-treated-targets",
    "List all workspace extraction changes where the current branch accepted an external delta.",
    "query",
  ),
  route(
    "direct-import-edges",
    "Show the direct recorded edges of this one import @q2-f408.",
    "direct-edges",
  ),
  who(
    "copy-custody",
    "Report where the copied bytes came from and which recorded requested purpose belongs to the copy.",
    "copy",
    {
      sourceRef: "@src-47",
      statedIntentRef: "@intent-6",
      actor: "copy-runner",
    },
    ["@src-47", "@action-71"],
  ),
  who(
    "copy-missing-coordinate",
    "The copy record has a revision but its source coordinate is no longer visible. Give the supported origin only.",
    "copy",
    {
      sourceRevision: "source-rev-ab",
      visibleBoundary: "source context omitted",
    },
    ["@action-71"],
  ),
  who(
    "merged-source-and-review",
    "Attach the merge decision and exact incoming coordinate before the final applied change.",
    "merge",
    {
      decisionRef: "@choose-1",
      sourceRef: "@incoming-4",
      statedIntentRef: "@plan-0",
    },
    ["@choose-1", "@incoming-4", "@action-71"],
  ),
  who(
    "merge-actor-without-intent",
    "The merge owner is visible, but who wanted it and why are not recorded. Explain which evidence can be cited.",
    "merge",
    {
      decisionRef: "@review-5",
      actor: "Maintainer",
      visibleBoundary: "trigger message not available",
    },
    ["@review-5", "@action-71"],
  ),
  who(
    "external-custody-end",
    "Trace the imported template through the available external snapshot boundary without guessing who wrote it.",
    "external-import",
    {
      sourceRef: "@snapshot-3",
      sourceRevision: "rev-plb7",
      actor: "Importer",
      visibleBoundary: "external snapshot",
    },
    ["@snapshot-3", "@action-71"],
  ),
  who(
    "external-ingress-intent",
    "The import was explicitly requested for a staged review. Preserve that purpose without describing the original author's motivation.",
    "external-import",
    {
      sourceRef: "@receipt-3",
      statedIntentRef: "@request-12",
      visibleBoundary: "authorship outside imported snapshot",
    },
    ["@receipt-3", "@action-71"],
  ),
  who(
    "managed-change-owner",
    "Explain what can be attributed for a managed edit where the actor is known but no stated reason is visible.",
    "managed-edit",
    { actor: "Operator" },
    ["@action-71"],
  ),
  who(
    "managed-change-stated-reason",
    "Give the exact recorded reason for a patch requested by the coordinator.",
    "managed-edit",
    { statedIntentRef: "@root-request", visibleBoundary: null },
    ["@action-71"],
  ),
  constraint(
    "latency-budget-cross-runtime",
    "drain-window",
    "Should we extend the retry wait? Check constraints in the workspace's own decisions.",
    "Requests must complete within the deployment drain window.",
    [
      observed(
        "@cause-open",
        "cause",
        "The owner asked to finish requests before the 30 second deployment drain.",
      ),
      observed(
        "@cohort-read",
        "cohort",
        "The same rollout work shortened idle socket waits for the deployment cutoff.",
        "trigger",
      ),
    ],
    "supported",
    ["@cause-open", "@cohort-read"],
  ),
  constraint(
    "stale-network-rule",
    "historic-note",
    "Check whether an old design note still establishes the constraint for the new hosting surface.",
    "All deployments require the old long-lived session.",
    [
      observed(
        "@memo-old",
        "note",
        "The rollout note assumed the old host required persistent connections.",
      ),
    ],
    "inconclusive",
    ["@memo-old"],
  ),
  constraint(
    "rejection-shared-property",
    "drain-window",
    "A keepalive proposal differs from backoff by implementation. Does it repeat the previously rejected behavior?",
    "Keep requests waiting beyond the deployment drain timer.",
    [
      observed(
        "@historic-retry",
        "rejection",
        "The request to allow retry waits longer than the deployment timer was rejected explicitly.",
      ),
      observed(
        "@copy",
        "history",
        "There were recent edits to the keepalive numerics.",
        "mechanical",
      ),
    ],
    "rejected",
    ["@historic-retry"],
  ),
  constraint(
    "mechanical-no-purpose",
    "intent-tier",
    "The diff shows several values changed. Can we infer they were all aiming to reduce hosting costs?",
    "The user intended to reduce hosting costs.",
    [
      observed(
        "@raw-a",
        "history",
        "Twenty events changed the timeout numeric literal.",
        "mechanical",
      ),
      observed(
        "@raw-b",
        "cohort",
        "Two files were removed from source.",
        "mechanical",
      ),
    ],
    "inconclusive",
    [],
  ),
  constraint(
    "unrelated-rejection-not-veto",
    "cross-component-rejection",
    "Find whether the logged panel layout objection changes the permission review constraint.",
    "Only recipients selected by the workspace owner may view the draft.",
    [
      observed(
        "@message",
        "cause",
        "Owner explicitly limited draft visibility to selected reviewers.",
      ),
      observed(
        "@select-at-write",
        "cohort",
        "The delivery phase was reviewed against the same recipient selection.",
        "trigger",
      ),
      observed(
        "@font",
        "rejection",
        "The owner declined the proposed headline font.",
      ),
    ],
    "supported",
    ["@message", "@select-at-write"],
  ),
  constraint(
    "query-receipt-overbreadth",
    "visibility",
    "The tool refused the question as too broad. What does the next observation require?",
    "A complete global workspace inventory can be read in the current scope.",
    [
      observed(
        "@old-list",
        "note",
        "A previous teammate listed source units under a known repository.",
      ),
    ],
    "narrow-scope",
    [],
    "too-broad",
  ),
  constraint(
    "pruned-history-does-not-imply-none",
    "visibility",
    "Can we assert no earlier objection exists after the trajectory branch was pruned?",
    "There were no earlier objections to the revision.",
    [],
    "inconclusive",
    [],
    "pruned",
  ),
  constraint(
    "restricted-rejection-unavailable",
    "visibility",
    "Explain what the visible boundary permits us to conclude about an unobserved review.",
    "The whole team already approved this revision.",
    [
      observed(
        "@private-guess",
        "rejection",
        "A private thread may contain an objection.",
        "trigger",
        false,
      ),
    ],
    "inconclusive",
    [],
    "outside-visibility",
  ),
  constraint(
    "publication-assumption-conflict",
    "historic-note",
    "The stored note assumes only preview builds need approval. Re-evaluate that rule.",
    "Production versions can be published without review.",
    [
      observed(
        "@outdated",
        "note",
        "Old reviewer wrote that automatic production is the default.",
      ),
      observed(
        "@production-plan",
        "cause",
        "The current release owner specified mandatory review of every production release.",
      ),
    ],
    "inconclusive",
    ["@production-plan"],
  ),
  constraint(
    "hidden-objection-never-cited",
    "visibility",
    "Explain the supported outcome of a targeted change without revealing a concealed record.",
    "Keep locally committed edits separate from protected-main publication.",
    [
      observed(
        "@review-goal",
        "cause",
        "The owner requested local changes only.",
      ),
      observed(
        "@reviewed-commit",
        "cohort",
        "The same review explicitly separated commit and protected-main publication.",
      ),
      observed(
        "@external-noaccess",
        "rejection",
        "One undisclosed account object is inaccessible.",
        "stated",
        false,
      ),
    ],
    "supported",
    ["@review-goal", "@reviewed-commit"],
    "outside-visibility",
  ),
];
export type ProvenanceWorld = (typeof provenanceReviewWorlds)[number];
