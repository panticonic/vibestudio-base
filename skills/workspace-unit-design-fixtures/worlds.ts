import type {
  AgenticEvidence,
  ArchitectureEvidence,
  BuildReceipt,
  CanaryEvidence,
  CapabilityEvidence,
  ExtensionActivationEvidence,
  ExtensionEvidence,
  ExtensionStatusReceipt,
  UnitFinding,
  UnitReviewLeaf,
  UnitReviewRequest,
} from "../workspace-unit-design/types.ts";

export type WorkspaceUnitDesignWorld = {
  id: string;
  sourceGroup: string;
  sourceGroups?: string[];
  request: UnitReviewRequest;
  expected: UnitFinding & { components?: UnitFinding[] };
};

const architecture = "skill:architecture";
const extension = "skill:extensiondev";
const capability = "skill:capabilities";
const agentic = "skill:agentic-development";

function expected(
  decision: UnitFinding["decision"],
  finding: string,
  ...evidenceIds: string[]
): UnitFinding {
  return { decision, finding, evidenceIds };
}

function ownership(
  id: string,
  goal: string,
  subject: Extract<ArchitectureEvidence, { kind: "ownership" }>["subject"],
  candidateOwner: string,
  result: [UnitFinding["decision"], string],
): WorkspaceUnitDesignWorld {
  return {
    id,
    sourceGroup: architecture,
    request: {
      kind: "architecture",
      goal,
      evidence: {
        kind: "ownership",
        id: `${id}-design`,
        subject,
        candidateOwner,
      },
    },
    expected: expected(...result, `${id}-design`),
  };
}

type Route = Extract<ArchitectureEvidence, { kind: "routing" }>;
function route(
  id: string,
  goal: string,
  overrides: Partial<Route>,
  result: [UnitFinding["decision"], string],
): WorkspaceUnitDesignWorld {
  const evidence: Route = {
    kind: "routing",
    id: `${id}-policy`,
    sourceWorkspace: "catalog",
    targetWorkspace: "inventory",
    sourceContext: "catalog-review",
    observedContext: "catalog-review",
    outgoing: true,
    incoming: true,
    receiverExposed: true,
    ...overrides,
  };
  return {
    id,
    sourceGroup: architecture,
    request: { kind: "architecture", goal, evidence },
    expected: expected(...result, evidence.id),
  };
}

function ext(
  id: string,
  goal: string,
  evidence: ExtensionEvidence,
  result: UnitFinding,
): WorkspaceUnitDesignWorld {
  return {
    id,
    sourceGroup: extension,
    request: { kind: "extension", goal, evidence },
    expected: result,
  };
}

const unit = "extensions/reading-list";
const context = "review-reading-list";
const state = "reading-list-candidate";
const activeVersion = "ev-reading-list-2";
export const buildReceipt: BuildReceipt = {
  id: "reading-list-build",
  operation: "build",
  target: unit,
  contextId: context,
  ref: `ctx:${context}`,
  stateHash: state,
  status: "ok",
  artifactKey: "bundle-reading-list-2",
};
export const activeStatus: ExtensionStatusReceipt = {
  id: "reading-list-status",
  source: unit,
  status: "running",
  activeEv: activeVersion,
  pendingApproval: null,
  lastError: null,
  methods: ["listEntries"],
};
function activation(
  id: string,
  goal: string,
  overrides: Partial<ExtensionActivationEvidence>,
  result: [UnitFinding["decision"], string],
  ids = [buildReceipt.id, activeStatus.id],
): WorkspaceUnitDesignWorld {
  return ext(
    id,
    goal,
    {
      kind: "activation",
      source: unit,
      context,
      testedState: state,
      candidateEv: activeVersion,
      sourceCommitted: true,
      published: true,
      build: buildReceipt,
      status: activeStatus,
      ...overrides,
    },
    expected(...result, ...ids),
  );
}

function cap(
  id: string,
  goal: string,
  evidence: CapabilityEvidence,
  result: UnitFinding,
): WorkspaceUnitDesignWorld {
  return {
    id,
    sourceGroup: capability,
    request: { kind: "capability", goal, evidence },
    expected: result,
  };
}

function agent(
  id: string,
  goal: string,
  evidence: AgenticEvidence,
  result: UnitFinding,
): WorkspaceUnitDesignWorld {
  return {
    id,
    sourceGroup: agentic,
    request: { kind: "agentic", goal, evidence },
    expected: result,
  };
}

const agentContext = "review-agentic-composer";
const agentUnit = "packages/agentic-chat";
const agentState = "composer-candidate";
const agentBuild: BuildReceipt = {
  ...buildReceipt,
  id: "composer-build",
  target: agentUnit,
  contextId: agentContext,
  ref: `ctx:${agentContext}`,
  stateHash: agentState,
  artifactKey: "composer-bundle",
};
const agentTest: BuildReceipt = {
  ...agentBuild,
  id: "composer-suite",
  operation: "test",
  status: "passed",
  artifactKey: null,
};
function canary(
  id: string,
  goal: string,
  overrides: Partial<CanaryEvidence>,
  result: [UnitFinding["decision"], string],
  ids = [agentBuild.id, agentTest.id],
): WorkspaceUnitDesignWorld {
  const attempt = `${id}-attempt`;
  return agent(
    id,
    goal,
    {
      kind: "canary",
      id: attempt,
      parent: "author",
      canary: "composer-canary",
      context: agentContext,
      candidateState: agentState,
      unit: agentUnit,
      build: agentBuild,
      test: agentTest,
      snapshotContext: agentContext,
      transcriptPersisted: true,
      remainingOwnedResources: [],
      ...overrides,
    },
    expected(...result, attempt, ...ids),
  );
}

const sharedRecords = {
  capability: "records.read",
  resource: "reading-list:bookmarks",
  tier: "gated",
} as const;
const openStatus = {
  capability: "status.read",
  resource: "reading-list:status",
  tier: "open",
} as const;
const method = {
  kind: "method",
  source: unit,
  candidateEv: activeVersion,
  method: "listEntries",
  declaredMethods: ["listEntries"],
  status: activeStatus,
} as const;
const manifest = {
  kind: "manifest",
  source: unit,
  candidateDigest: "reading-list-source-v2",
} as const;
const candidateReady = activation(
  "approved-exact-version",
  "Check that the approved reading-list update is active on the exact built source.",
  {},
  ["ready", "candidate-active"],
);
const allowed = cap(
  "allowed-read-preflight",
  "Read the bookmarks preflight and report whether the proposed read is allowed.",
  {
    kind: "preflight",
    method: "listEntries",
    preflight: {
      id: "preflight-bookmarks",
      decision: "allowed",
      leaves: [sharedRecords],
    },
  },
  expected("ready", "preflight-allowed", "preflight-bookmarks"),
);
const pending = activation(
  "await-manager-approval",
  "Check whether the staged reading-list update can be declared active while manager review is pending.",
  {
    status: {
      ...activeStatus,
      activeEv: "ev-reading-list-1",
      pendingApproval: "extension.update",
    },
  },
  ["waiting", "extension-review-pending"],
);
const badRequest = cap(
  "neighbor-resource-request",
  "Review the proposed bookmarks read when the manifest names the archive resource.",
  {
    kind: "request",
    id: "neighbor-request",
    contract: sharedRecords,
    requests: [
      { capability: "records.read", resource: "reading-list:archive" },
    ],
  },
  expected("revision-needed", "request-scope-mismatch", "neighbor-request"),
);
const unobserved = canary(
  "transcript-from-neighbor-context",
  "Check whether a transcript saved in a sibling context closes the composer canary.",
  { snapshotContext: "review-agentic-sidebar" },
  ["not-observed", "canary-transcript-unobserved"],
);
const passedCanary = canary(
  "independent-exact-canary",
  "Review the new composer canary across exact-context build, tests, persisted transcript and cleanup.",
  {},
  ["ready", "canary-verified"],
);

export const workspaceUnitDesignWorlds: WorkspaceUnitDesignWorld[] = [
  ownership(
    "host-admits-operation",
    "Review the plan that leaves permission admission with the host.",
    "operation-admission",
    "host",
    ["ready", "ownership-confirmed"],
  ),
  ownership(
    "protect-ref-source-of-truth",
    "Find the protected-main source of truth when a panel proposes to cache the authoritative record.",
    "protected-ref",
    "workspace-panel",
    ["revision-needed", "owner-semantic-vcs"],
  ),
  ownership(
    "retain-channel-history",
    "Locate durable dialogue history after the renderer closes.",
    "channel-history",
    "channel-log",
    ["ready", "ownership-confirmed"],
  ),
  ownership(
    "workspace-source-not-bundle",
    "Check the proposal to recover managed workspace source from a materialized output.",
    "workspace-source",
    "build-adapter",
    ["revision-needed", "owner-semantic-vcs"],
  ),
  ownership(
    "compiled-panel-artifact",
    "Check which subsystem supplies the exact materialized build.",
    "materialized-build",
    "build-adapter",
    ["ready", "ownership-confirmed"],
  ),
  ownership(
    "durable-domain-data",
    "Review the proposal to store persistent reading-list records in a renderer-owned object.",
    "database-state",
    "workspace-panel",
    ["revision-needed", "owner-durable-provider"],
  ),
  ownership(
    "credential-injection-owner",
    "Confirm where a reviewed provider credential is injected.",
    "credential-injection",
    "host",
    ["ready", "ownership-confirmed"],
  ),
  route(
    "cross-workspace-read",
    "Review both declared policies and the receiver's exposure for the catalog-to-inventory read.",
    {},
    ["ready", "route-prerequisites"],
  ),
  route(
    "route-outgoing-closed",
    "Report the missing prerequisite when inventory accepts a read and the catalog has closed outgoing calls.",
    { outgoing: false },
    ["revision-needed", "outgoing-policy"],
  ),
  route(
    "route-incoming-closed",
    "Report why the catalog's allowed request still lacks inventory approval.",
    { incoming: false },
    ["revision-needed", "incoming-policy"],
  ),
  route(
    "receiver-not-exposed",
    "Review a route whose workspace policies allow the call but whose receiver exposes no method.",
    { receiverExposed: false },
    ["revision-needed", "receiver-exposure"],
  ),
  route(
    "route-receipt-context-drift",
    "Check a route using policies observed under the catalog's preview context.",
    { observedContext: "catalog-preview" },
    ["revision-needed", "context-scope-mismatch"],
  ),
  route(
    "local-route-own-context",
    "Confirm which cross-workspace policy observations are relevant to a local route.",
    {
      targetWorkspace: "catalog",
      outgoing: false,
      incoming: false,
      receiverExposed: false,
    },
    ["ready", "route-prerequisites"],
  ),
  ext(
    "manifest-verified",
    "Review the new extension manifest from the validator receipt attached to its exact source.",
    {
      ...manifest,
      receipt: {
        id: "reading-manifest",
        unit,
        candidateDigest: manifest.candidateDigest,
        errorCode: null,
      },
    },
    expected("ready", "manifest-verified", "reading-manifest"),
  ),
  ext(
    "manifest-wrong-kind",
    "Carry the shared validator's rejection for client configuration filed as an extension.",
    {
      ...manifest,
      receipt: {
        id: "wrong-kind-manifest",
        unit,
        candidateDigest: manifest.candidateDigest,
        errorCode: "MANIFEST_KIND",
      },
    },
    expected("revision-needed", "MANIFEST_KIND", "wrong-kind-manifest"),
  ),
  ext(
    "manifest-previous-candidate",
    "Check whether the previous candidate's passed validation closes the manifest review.",
    {
      ...manifest,
      receipt: {
        id: "previous-manifest",
        unit,
        candidateDigest: "reading-list-source-v1",
        errorCode: null,
      },
    },
    expected("not-observed", "manifest-other-candidate", "previous-manifest"),
  ),
  activation(
    "working-source-uncommitted",
    "Review whether verification can close while the exact candidate is uncommitted.",
    { sourceCommitted: false, build: null, status: null },
    ["waiting", "source-uncommitted"],
    [],
  ),
  activation(
    "candidate-build-from-preview",
    "Reject build evidence from a different semantic context despite its passing report.",
    {
      build: {
        ...buildReceipt,
        contextId: "preview-reading-list",
        ref: "ctx:preview-reading-list",
      },
    },
    ["not-observed", "exact-build-unobserved"],
  ),
  activation(
    "candidate-build-failed",
    "Review publication readiness when the exact context build failed.",
    {
      build: { ...buildReceipt, status: "failed", artifactKey: null },
      published: false,
    },
    ["revision-needed", "candidate-build-failed"],
  ),
  activation(
    "unpublished-local-build",
    "Review the reading-list change after local verification and before protected-main publication.",
    { published: false },
    ["waiting", "source-not-published"],
  ),
  pending,
  activation(
    "replacement-failed-old-live",
    "Determine the update outcome when supervision retained the old version and recorded its replacement failure.",
    {
      status: {
        ...activeStatus,
        activeEv: "ev-reading-list-1",
        lastError: "activation returned an invalid object",
      },
    },
    ["revision-needed", "replacement-failed"],
  ),
  activation(
    "old-version-still-live",
    "Check the published candidate while the supervisor still reports the old version without an error.",
    { status: { ...activeStatus, activeEv: "ev-reading-list-1" } },
    ["waiting", "previous-version-active"],
  ),
  candidateReady,
  ext(
    "receiver-method-missing",
    "Check whether a method declared in the exact candidate is actually exposed by the running receiver.",
    {
      ...method,
      declaredMethods: ["listEntries"],
      status: { ...activeStatus, methods: ["countEntries"] },
    },
    expected("revision-needed", "receiver-method-missing", activeStatus.id),
  ),
  ext(
    "receiver-method-wrong-version",
    "Check the method surface when only an older running version exposes the requested method.",
    {
      ...method,
      declaredMethods: ["listEntries"],
      status: { ...activeStatus, activeEv: "ev-reading-list-1" },
    },
    expected("not-observed", "live-method-unobserved", activeStatus.id),
  ),
  allowed,
  cap(
    "acquirable-preflight",
    "Decide whether a fresh review is still needed before reading the archive.",
    {
      kind: "preflight",
      method: "listEntries",
      preflight: {
        id: "preflight-archive",
        decision: "acquirable",
        leaves: [{ ...sharedRecords, resource: "reading-list:archive" }],
      },
    },
    expected("waiting", "acquisition-required", "preflight-archive"),
  ),
  cap(
    "denied-preflight",
    "Report the authority decision for a proposed administrative review without invoking it.",
    {
      kind: "preflight",
      method: "reviewPolicy",
      preflight: {
        id: "preflight-admin",
        decision: "denied",
        leaves: [
          {
            capability: "policy.read",
            resource: "workspace:reading-list",
            tier: "critical",
          },
        ],
      },
    },
    expected("revision-needed", "operation-denied", "preflight-admin"),
  ),
  cap(
    "open-status-no-request",
    "Check whether an open status call needs a manifest request when the manifest requests only the separate bookmarks read.",
    {
      kind: "request",
      id: "status-manifest",
      contract: openStatus,
      requests: [sharedRecords],
    },
    expected("ready", "open-method-no-request", "status-manifest"),
  ),
  cap(
    "open-status-extra-request",
    "Review the proposed manifest entry for a status method whose receiver contract is open.",
    {
      kind: "request",
      id: "open-entry",
      contract: openStatus,
      requests: [openStatus],
    },
    expected("revision-needed", "open-method-requested", "open-entry"),
  ),
  cap(
    "protected-request-omitted",
    "Check whether the critical policy read has the receiver's requested capability.",
    {
      kind: "request",
      id: "critical-entry",
      contract: {
        capability: "policy.read",
        resource: "workspace:reading-list",
        tier: "critical",
      },
      requests: [sharedRecords],
    },
    expected("revision-needed", "capability-not-requested", "critical-entry"),
  ),
  badRequest,
  cap(
    "closed-parent-cannot-continue-inline",
    "Review inline work after its admitted parent execution closed even though a job record exists.",
    {
      kind: "durable-scope",
      id: "expired-inline",
      parentOpen: false,
      admittedChild: true,
      persistedJob: true,
      continuationMode: "inline",
    },
    expected("revision-needed", "inline-scope-ended", "expired-inline"),
  ),
  cap(
    "persist-before-new-execution",
    "Review the detached continuation whose new execution starts from a persisted job.",
    {
      kind: "durable-scope",
      id: "persisted-archive-job",
      parentOpen: false,
      admittedChild: false,
      persistedJob: true,
      continuationMode: "new-execution",
    },
    expected("ready", "durable-admission", "persisted-archive-job"),
  ),
  agent(
    "chat-product-owner",
    "Review placement of chat-panel-specific product composition.",
    {
      kind: "owner",
      id: "chat-product-design",
      subject: "chat-product",
      candidateOwner: "panels/chat",
    },
    expected("ready", "agentic-owner-confirmed", "chat-product-design"),
  ),
  agent(
    "shared-reducer-placement",
    "Direct a shared transcript reducer proposed for the chat panel to its protocol owner.",
    {
      kind: "owner",
      id: "protocol-reducer-design",
      subject: "protocol-reducer",
      candidateOwner: "panels/chat",
    },
    expected(
      "revision-needed",
      "owner-packages/agentic-protocol",
      "protocol-reducer-design",
    ),
  ),
  agent(
    "native-session-placement",
    "Review moving native session management into client coordination.",
    {
      kind: "owner",
      id: "native-session-design",
      subject: "native-session",
      candidateOwner: "packages/agentic-core",
    },
    expected(
      "revision-needed",
      "owner-packages/agentic-do",
      "native-session-design",
    ),
  ),
  canary(
    "parent-agent-reused",
    "Check whether a parent-agent follow-up qualifies as the fresh composer canary.",
    { canary: "author" },
    ["revision-needed", "canary-not-independent"],
  ),
  canary(
    "suite-tests-another-state",
    "Review a canary with a passing suite receipt for the preceding composer state.",
    { test: { ...agentTest, stateHash: "composer-previous" } },
    ["not-observed", "canary-receipt-mismatch"],
  ),
  canary(
    "composer-suite-failed",
    "Inspect the exact-state canary with a failing test suite and a passing build.",
    { test: { ...agentTest, status: "failed" } },
    ["revision-needed", "canary-verification-failed"],
  ),
  unobserved,
  canary(
    "owned-canary-panel-left-open",
    "Check canary completion after all verification passes but a temporary panel remains.",
    { remainingOwnedResources: ["composer-canary-preview"] },
    ["revision-needed", "canary-cleanup-incomplete"],
  ),
  passedCanary,
  agent(
    "wrong-slot-attempt-after-rebuild",
    "Check whether the new renderer attempt actually belongs to the requested chat slot.",
    {
      kind: "page-attempt",
      id: "neighbor-slot-attempt",
      slot: "chat",
      observedSlot: "chat-preview",
      targetRef: "ctx:composer",
      observedRef: "ctx:composer",
      beforeBuild: "chat-build-1",
      observedBuild: "chat-build-2",
      changedSource: true,
    },
    expected("not-observed", "panel-attempt-unbound", "neighbor-slot-attempt"),
  ),
  agent(
    "old-panel-render-stale",
    "Verify that the changed chat panel was rebuilt for its existing renderer slot.",
    {
      kind: "page-attempt",
      id: "stale-chat-attempt",
      slot: "chat",
      observedSlot: "chat",
      targetRef: "ctx:composer",
      observedRef: "ctx:composer",
      beforeBuild: "chat-build-1",
      observedBuild: "chat-build-1",
      changedSource: true,
    },
    expected("revision-needed", "panel-build-stale", "stale-chat-attempt"),
  ),
  agent(
    "matching-panel-new-build",
    "Confirm that the rebuilt renderer is on the reviewed ref and existing slot.",
    {
      kind: "page-attempt",
      id: "fresh-chat-attempt",
      slot: "chat",
      observedSlot: "chat",
      targetRef: "ctx:composer",
      observedRef: "ctx:composer",
      beforeBuild: "chat-build-1",
      observedBuild: "chat-build-2",
      changedSource: true,
    },
    expected("ready", "panel-attempt-verified", "fresh-chat-attempt"),
  ),
  {
    id: "release-readiness-joins-three-receipts",
    sourceGroup: extension,
    sourceGroups: [extension, capability, agentic],
    request: {
      kind: "composed",
      goal: "Review the exact reading-list release and its proposed read alongside the independently tested composer; retain the evidence for each decision.",
      work: [
        candidateReady.request,
        allowed.request,
        passedCanary.request,
      ] as UnitReviewLeaf[],
    },
    expected: {
      ...expected(
        "ready",
        "prerequisites-verified",
        "reading-list-build",
        "reading-list-status",
        "preflight-bookmarks",
        "independent-exact-canary-attempt",
        "composer-build",
        "composer-suite",
      ),
      components: [
        candidateReady.expected,
        allowed.expected,
        passedCanary.expected,
      ],
    },
  },
  {
    id: "wrong-request-takes-priority-over-review-and-missing-transcript",
    sourceGroup: capability,
    sourceGroups: [capability, extension, agentic],
    request: {
      kind: "composed",
      goal: "Find the issue to address first while the update awaits review and a composer canary is missing the in-context transcript.",
      work: [
        pending.request,
        unobserved.request,
        badRequest.request,
      ] as UnitReviewLeaf[],
    },
    expected: {
      ...expected(
        "revision-needed",
        "required-revision",
        "reading-list-build",
        "reading-list-status",
        "transcript-from-neighbor-context-attempt",
        "composer-build",
        "composer-suite",
        "neighbor-request",
      ),
      components: [pending.expected, unobserved.expected, badRequest.expected],
    },
  },
];
