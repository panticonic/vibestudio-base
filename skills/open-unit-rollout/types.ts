export type RolloutUnit = {
  id: string; title: string; kind: "worker" | "panel"; mayEdit: boolean; mayRunChecks: boolean; mayCommit: boolean;
};
export type RolloutSummary = { stateHash: string; status: "ok" | "failed" | "skipped"; diagnostics: string[] };
export type RolloutCheck = {
  revision: string; build: RolloutSummary;
  check: { runtime: "workerd" | "browser"; status: "passed" | "failed" | "unavailable"; count: number; receipt: string | null } | null;
};
export type RolloutObservation = { unit: RolloutUnit; revision: string; editablePaths: string[]; build: RolloutSummary };
export type RolloutSource = { path: string; text: string };
export type RolloutEdit = { path: string; before: string; after: string };
export type RolloutProposal = { edits: RolloutEdit[]; reason: string };
export type RolloutDiagnosis = { reason: string; files: RolloutSource[]; canRepair: boolean };
export type RolloutApply = { status: "changed" | "applied"; revision: string };
export type RolloutStage = { observation: RolloutObservation; check: RolloutCheck | null; diagnosis: string | null };
export type RolloutCommit =
  | { status: "changed"; revision: string }
  | { status: "committed"; verifiedRevision: string; revision: string; eventId: string };
export type RolloutDecision = { action: "repair" | "check" | "commit" | "hold" | "report"; reason: string };
export type UnitRolloutReport = {
  status: "repaired" | "committed" | "verified" | "held";
  unitId: string | null; revision: string | null; check: RolloutCheck | null;
  release: RolloutCommit | null; reason: string;
};
