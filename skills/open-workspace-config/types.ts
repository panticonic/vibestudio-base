export type ConfigQuestion = "panel-restore" | "launch-panels" | "minimum-app" | "desktop-client" |
  "natlang-provider" | "terminal-extensions" | "agent-fast-mode";
export type ConfigFact = { question: ConfigQuestion; declared: boolean; value: string };
export type ConfigBrief = {
  subject: string; noteHash: string | null; noteId: string | null; noteName: string | null;
  noteEpoch: number | null; noteFacts: ConfigFact[];
};
export type ConfigLens = { questions: ConfigQuestion[]; inspectManifest: boolean; inspectDependencies: boolean };
export type ConfigIdentity = {
  id: string; name: string; configId: string; epoch: number; appVersion: string;
  hubVersion: string; projectionNamespace: string; projectionUsesCurrentNamespace: boolean; facts: ConfigFact[];
};
export type ConfigManifestState = { ref: string; fileId: string; digest: string; epoch: number; facts: ConfigFact[] };
export type ConfigHistory = {
  contextId: string; clean: boolean; working: ConfigManifestState; committed: ConfigManifestState;
  main: ConfigManifestState;
};
export type ConfigSource = { addressDigest: string; track: string | null; pinnedCommit: string | null };
export type ConfigDependencies = {
  mainEvent: string; manifestDigest: string; epoch: number; minimumAppVersion: string | null; sources: ConfigSource[];
};
export type ConfigEvidence = {
  active: ConfigIdentity; history: ConfigHistory | null; dependencies: ConfigDependencies | null;
};
export type ConfigOutcome = {
  noteStatus: "matches" | "stale-values" | "different-workspace" | "stale-name" | "different-epoch" | "no-note";
  sourceStatus: "uninspected" | "aligned" | "working-only" | "committed-only" | "working-and-committed";
  dependencyStatus: "uninspected" | "declared" | "no-declarations" | "epoch-mismatch";
  affectedQuestions: ConfigQuestion[];
  workingDifferences: ConfigQuestion[];
  committedDifferences: ConfigQuestion[];
  summary: string;
};
export type ConfigDisposition = { path: string; digest: string };
export type ConfigReport = {
  brief: ConfigBrief; lens: ConfigLens; evidence: ConfigEvidence; outcome: ConfigOutcome;
  handoff: ConfigDisposition | null;
};
