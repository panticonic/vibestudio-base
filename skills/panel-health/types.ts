export type PanelHealthSignal = {
  sequence: number;
  level: "error" | "warning" | "info";
  message: string;
};
export type PanelHealthObservation = {
  id: string;
  panelId: string;
  attemptId: string;
  buildKey: string;
  phase: "ready" | "pending" | "failed" | "unavailable";
  markers: { id: string; values: string[] }[];
  diagnostics: PanelHealthSignal[];
  consoleThrough: number;
  dropped: number;
};
export type PanelHealthExpectation = {
  markers: { id: string; exact: string[] }[];
  allowedErrors: string[];
};
export type PanelHealthRequest = {
  goal: string;
  expectation: PanelHealthExpectation;
  observeChange: boolean;
};
export type PanelHealthAssessment = {
  state: "healthy" | "attention" | "inconclusive";
  blockers: string[];
  evidence: string[];
};
export type PanelHealthReport = {
  initial: PanelHealthAssessment;
  later: PanelHealthAssessment | null;
  outcome: "healthy" | "recovered" | "attention" | "inconclusive";
};

export type RecoverySurface = { id: string; title: string; audience: string; authorized: boolean };
export type RecoveryCatalog = { revision: string; surfaces: RecoverySurface[] };
export type RecoveryBinding = {
  surface: RecoverySurface;
  expectation: PanelHealthExpectation;
  reloadAllowed: boolean;
};
export type RecoveryView = {
  revision: string;
  title: string;
  rendererInstance: string;
  controls: { id: string; label: string }[];
  health: PanelHealthObservation;
};
export type RecoveryAction = { kind: "click"; control: string } | { kind: "reload" };
export type RecoveryDecision = RecoveryAction | { kind: "stop"; reason: string };
export type RecoveryEffect = { revision: string; action: RecoveryAction; result: "applied" | "changed" | "denied" };
export type RecoveryReport =
  | { status: "unresolved"; reason: string }
  | {
    status: "healthy" | "recovered" | "attention" | "inconclusive" | "held";
    surfaceId: string;
    initial: PanelHealthAssessment;
    final: PanelHealthAssessment;
    effects: RecoveryEffect[];
    reason: string;
  };

export type PanelRecoveryResult={status:"unresolved";reason:string}|{status:"healthy"|"recovered"|"attention"|"inconclusive"|"held";surfaceId:string;initial:PanelHealthAssessment;final:PanelHealthAssessment;reason:string};
