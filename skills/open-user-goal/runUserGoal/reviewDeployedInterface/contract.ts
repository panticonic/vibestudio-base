export type InterfaceKind = "agent" | "worker" | "extension";
export type InterfaceSubject = { id: string; title: string; source: string; kind: InterfaceKind };
export type ReviewScope = {
  source: string; definition: string; revision: string;
  grant: "inspect-only" | "local-review" | "widen-access" | "withdrawn";
  needsDeployedMethod: boolean;
  expectedKind: InterfaceKind;
  method: string | null;
};
export type InterfaceSurvey = { subjects: InterfaceSubject[]; review: ReviewScope };
export type MethodEvidence = {
  basis: "sealed-worker-contract" | "active-extension-registration"; name: string; className: string | null; signature: string | null; inputDigest: string | null;
  crossWorkspace: boolean | null; websiteEligible: boolean | null;
};
export type DeployedDefinition = {
  state: "bound" | "not-attested" | "ambiguous";
  effectiveVersion: string | null; buildKey: string | null;
  diagnosticMethod: MethodEvidence | null;
};
export type InterfaceObservation = {
  subject: InterfaceSubject; head: string; authoredDigest: string;
  entry: string; classes: string[]; declaredServices: string[];
  declaredMethods: string[]; observedInterface: string[];
  deployed: DeployedDefinition;
  architecture: {
    goal: string; operationId: string; concern: "workspace-history" | "conversation-history" | "mission-record";
    proposedOwner: "semantic-vcs" | "durable-channel" | "durable-provider" | "panel-state" | "build-projection" | "rpc-adapter";
  } | null;
};
export type InterfaceDecision = "reviewable" | "deployed-method-confirmed" | "held-kind" | "held-assignment" |
  "held-stale" | "held-authority" | "held-ownership" | "held-deployed";
export type InterfaceHandoff = { path: string; bytes: number; sha256: string };
