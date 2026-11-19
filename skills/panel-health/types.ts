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
