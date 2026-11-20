export type OwnershipSubject =
  | "operation-admission"
  | "protected-ref"
  | "channel-history"
  | "workspace-source"
  | "materialized-build"
  | "panel-presentation"
  | "database-state"
  | "credential-injection";
export type ArchitectureEvidence =
  | {
      kind: "ownership";
      id: string;
      subject: OwnershipSubject;
      candidateOwner: string;
    }
  | {
      kind: "routing";
      id: string;
      sourceWorkspace: string;
      targetWorkspace: string;
      sourceContext: string;
      observedContext: string;
      outgoing: boolean;
      incoming: boolean;
      receiverExposed: boolean;
    };

export type BuildReceipt = {
  id: string;
  operation: "build" | "test";
  target: string;
  contextId: string;
  ref: string;
  stateHash: string;
  status: string | null;
  artifactKey: string | null;
};
export type ManifestReceipt = {
  id: string;
  unit: string;
  candidateDigest: string;
  errorCode: string | null;
};
export type ExtensionStatusReceipt = {
  id: string;
  source: string;
  status:
    | "running"
    | "available"
    | "stopped"
    | "error"
    | "pending-approval"
    | "building";
  activeEv: string | null;
  pendingApproval: "extension.install" | "extension.update" | null;
  lastError: string | null;
  methods: string[];
};
export type ExtensionManifestEvidence = {
  kind: "manifest";
  source: string;
  candidateDigest: string;
  receipt: ManifestReceipt | null;
};
export type ExtensionActivationEvidence = {
  kind: "activation";
  source: string;
  context: string;
  testedState: string;
  candidateEv: string;
  sourceCommitted: boolean;
  published: boolean;
  build: BuildReceipt | null;
  status: ExtensionStatusReceipt | null;
};
export type ExtensionMethodEvidence = {
  kind: "method";
  source: string;
  candidateEv: string;
  method: string;
  declaredMethods: string[];
  status: ExtensionStatusReceipt | null;
};
export type ExtensionEvidence =
  | ExtensionManifestEvidence
  | ExtensionActivationEvidence
  | ExtensionMethodEvidence;

export type AuthorityLeaf = {
  capability: string;
  resource: string;
  tier: "open" | "gated" | "critical";
};
export type PreflightEvidence = {
  id: string;
  decision: "allowed" | "acquirable" | "denied";
  leaves: AuthorityLeaf[];
};
export type ManifestRequest = { capability: string; resource: string };
export type CapabilityEvidence =
  | { kind: "preflight"; preflight: PreflightEvidence | null; method: string }
  | {
      kind: "request";
      id: string;
      contract: AuthorityLeaf;
      requests: ManifestRequest[];
    }
  | {
      kind: "durable-scope";
      id: string;
      parentOpen: boolean;
      admittedChild: boolean;
      persistedJob: boolean;
      continuationMode: "inline" | "new-execution";
    };

export type AgenticSubject =
  | "chat-product"
  | "reusable-chat-ui"
  | "default-tools"
  | "native-session"
  | "protocol-reducer"
  | "channel-log"
  | "client-coordination";
export type CanaryEvidence = {
  kind: "canary";
  id: string;
  parent: string;
  canary: string;
  context: string;
  candidateState: string;
  unit: string;
  build: BuildReceipt | null;
  test: BuildReceipt | null;
  snapshotContext: string;
  transcriptPersisted: boolean;
  remainingOwnedResources: string[];
};
export type AgenticEvidence =
  | {
      kind: "owner";
      id: string;
      subject: AgenticSubject;
      candidateOwner: string;
    }
  | CanaryEvidence
  | {
      kind: "page-attempt";
      id: string;
      slot: string;
      observedSlot: string;
      targetRef: string;
      observedRef: string;
      beforeBuild: string;
      observedBuild: string;
      changedSource: boolean;
    };

export type UnitReviewLeaf =
  | { kind: "architecture"; goal: string; evidence: ArchitectureEvidence }
  | { kind: "extension"; goal: string; evidence: ExtensionEvidence }
  | { kind: "capability"; goal: string; evidence: CapabilityEvidence }
  | { kind: "agentic"; goal: string; evidence: AgenticEvidence };
export type UnitReviewRequest =
  | UnitReviewLeaf
  | LiveExtensionDesignRequest
  | { kind: "composed"; goal: string; work: UnitReviewLeaf[] };
export type LiveExtensionDesignRequest = {
  kind: "extension-design-live";
  goal: string;
  operationId: string;
};
export type LiveExtensionDesignEvidence = {
  contextId: string;
  workingRevision: string;
  mainRevision: string;
  working: ExtensionManifestEvidence;
  published: ExtensionManifestEvidence;
};
export type ReviewDecision =
  | "ready"
  | "revision-needed"
  | "waiting"
  | "not-observed";
export type UnitFinding = {
  decision: ReviewDecision;
  finding: string;
  evidenceIds: string[];
};
export type UnitReview = UnitFinding & { components?: UnitFinding[] };
