export type AssemblyRevision = { kind: "event"; eventId: string } | { kind: "application"; applicationId: string };
export type AssemblyUnit = { id: string; label: string; role: string; repoPath: string; packageName: string };
export type AssemblyInventory = {
  head: AssemblyRevision;
  reviewed: AssemblyRevision;
  units: AssemblyUnit[];
  allowedBuilds: string[];
  mayStage: boolean;
  note: string;
};
export type SourceFile = { path: string; text: string; contentHash: string };
export type UnitSource = { unit: AssemblyUnit; head: AssemblyRevision; files: SourceFile[]; manifestSha: string };
export type AssemblyScope = { root: string | null; inspect: string[] };
export type ManifestAdjustment = { unit: string; dependency: string; action: "add-runtime" | "remove-runtime" };
export type AssemblyDependencies = { included: string[]; amendment: ManifestAdjustment[]; blockers: string[] };
export type AssemblyBuildReceipt = {
  unit: string;
  head: AssemblyRevision;
  stateHash: string;
  buildKeys: string[];
  diagnosticCodes: string[];
  result: "ok" | "failed" | "skipped";
  cached: boolean;
  sha256: string;
};
export type AssemblyPlan = {
  root: string | null;
  dependencies: AssemblyDependencies;
  head: AssemblyRevision;
  disposition: "ready" | "hold" | "unchanged" | "draft-repair";
  builds: AssemblyBuildReceipt[];
  rationale: string;
};
export type AssemblyHandoff = { path: string; bytes: number; sha256: string };
export type AssemblyReport = { plan: AssemblyPlan; handoff: AssemblyHandoff | null };
