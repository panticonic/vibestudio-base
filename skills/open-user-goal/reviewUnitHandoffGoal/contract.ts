export type UnitHandoffUnit = {
  path: string;
  name: string;
  kind: string;
  description: string;
};
export type UnitHandoffPlan = {
  path: string | null;
  focus: "manifest" | "identity" | "joined";
  inspectLifecycle: boolean;
  stageIcon: boolean;
  requireProtectedSource: boolean;
  reason: string;
};
export type UnitManifestAnchor = {
  digest: string;
  validationError: string | null;
  entry: string | null;
  activationEvents: string[];
  dependencyMode: string | null;
  icon: string | null;
};
export type UnitHandoffObservation = {
  unit: UnitHandoffUnit;
  revision: string;
  mainRevision: string;
  manifest: { working: UnitManifestAnchor; protectedMain: UnitManifestAnchor } | null;
  designRequest: { kind: "extension-design-live"; goal: string; operationId: string } | null;
  identityRequest: {
    goal: string;
    operationId: string;
    unit: { name: string; kind: string; description: string };
    prepare: boolean;
  };
};
export type UnitLifecycleObservation = {
  status: string;
  activeVersion: string | null;
  buildKey: string | null;
  sourceRevision: string | null;
  buildVersion: string | null;
  processId: string | null;
  health: string | null;
  pendingApproval: string | null;
};
