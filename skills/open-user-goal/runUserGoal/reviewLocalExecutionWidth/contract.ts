export type MachineScope = { machine: string; boot: string; configuration: string };
export type WorkNeed = { requestedRef: string | null; alternativesAllowed: boolean; lanes: number; minimumContext: number; tools: boolean };
export type ProviderRow = { id: string; ref: string; scope: MachineScope; selectable: boolean; tools: boolean; contextWindow: number; lane: "main" | "utility" };
export type ServerEvidence = { id: string; scope: MachineScope; lane: "main" | "utility"; modelRefs: string[]; advertisedWidth: number; running: boolean };
export type WorkInterval = { id: string; start: number; end: number; contextTokens: number; usedTools: boolean; terminal: "complete" | "failed" | "cancelled" };
export type WidthReceipt = { id: string; scope: MachineScope; provider: string; ref: string; lane: "main" | "utility"; intervals: WorkInterval[] };
export type WidthSurvey = {
  scope: MachineScope;
  requirement: WorkNeed;
  providers: ProviderRow[];
  servers: ServerEvidence[];
  inventory: { ref: string; tools: boolean; contextWindow: number; lane: "main" | "utility" }[];
  witnesses: { id: string; scope: MachineScope; provider: string; ref: string; lane: "main" | "utility" }[];
  release: "none" | "verified" | "include-hold";
};
export type WidthDisposition = "verified" | "startable" | "model-unavailable" | "provider-unavailable" | "incompatible" | "unproven-width" | "short-width";
export type WidthFinding = {
  disposition: WidthDisposition;
  ref: string | null;
  provider: string | null;
  advertisedWidth: number | null;
  witnessedWidth: number | null;
  witness: string | null;
  reason: string;
};
export type WidthHandoff = { path: string; bytes: number; sha256: string };
