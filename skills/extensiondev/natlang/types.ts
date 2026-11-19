export type ExtensionReleaseRequest = {
  goal: string;
  operationId: string;
  method: string;
};
export type ExtensionManifestView = {
  hash: string;
  activation: "startup" | "on-invoke" | "unknown";
  methods: string[];
};
export type ExtensionSource = {
  operationId: string;
  contextId: string;
  name: string;
  source: string;
  workingRevision: string;
  mainRevision: string;
  working: ExtensionManifestView | null;
  published: ExtensionManifestView | null;
  workingTree: string | null;
  publishedTree: string | null;
};
export type ExtensionRuntime = {
  operationId: string;
  name: string;
  source: string;
  status:
    | "running"
    | "available"
    | "stopped"
    | "error"
    | "pending-approval"
    | "building";
  activeEv: string | null;
  identity: string | null;
  methods: string[];
  pendingApproval: "extension.install" | "extension.update" | null;
  hasError: boolean;
  dependencyUpdate: boolean;
};
export type ExtensionSourceReview = {
  observation: ExtensionSource;
  disposition:
    | "missing-manifest"
    | "unpublished-candidate"
    | "undeclared-method"
    | "published-method";
};
export type ExtensionRuntimeReview = {
  observation: ExtensionRuntime;
  disposition:
    | "waiting-approval"
    | "building"
    | "failed"
    | "cold"
    | "method-not-observed"
    | "live-method";
};
export type ExtensionReleaseDecision =
  | "inspect-manifest"
  | "verify-and-publish-candidate"
  | "declare-method"
  | "wait-for-approval"
  | "wait-for-build"
  | "inspect-failure"
  | "await-activation"
  | "inspect-active-contract"
  | "observed-live";
export type ExtensionReleaseReview = {
  source: ExtensionSourceReview;
  runtime: ExtensionRuntimeReview;
  decision: ExtensionReleaseDecision;
};
