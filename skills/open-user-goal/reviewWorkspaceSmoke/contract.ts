export type SmokeAssignment = { id: string; goal: string; subject: string; context: string; revision: string; mayStage: boolean };
export type SmokePlan = { path: string; digest: string; context: string; revision: string; subject: string; exportName: string;
  probe: string; input: unknown; accepted: unknown };
export type SmokeSource = { matches: number; truncated: boolean; plans: SmokePlan[] };
export type SmokeSelection = { plan: SmokePlan | null; blocker: "hold-source" | "hold-ambiguity" | null };
export type SmokeRuntime = { packageName: string; exportName: string; callable: boolean; value: unknown; matchesAccepted:boolean; runDigest: string };
export type SmokeReceipt = { path: string; bytes: number; sha256: string };
export type WorkspaceSmokeFinding = string;
export type SmokeInvestigation = {source:SmokeSource;selection:SmokeSelection;runtime:SmokeRuntime|null;finding:string};
