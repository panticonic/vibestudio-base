export type Checks = { requiredBehavior: string[]; preserveBehavior: string[] };
export type InteractionStep =
  | { kind: "click"; role: string; name: string }
  | { kind: "fill"; role: string; name: string; text: string }
  | { kind: "inspect"; role: string; name: string };
export type Interaction = { steps: InteractionStep[] };
export type Observation = {
  revision: string;
  generation: string;
  phase: string;
  controls: { role: string; name: string }[];
  visibleText: string;
  console: string[];
  buildDiagnostics: string[];
};
export type InteractionObservation = {
  step: InteractionStep;
  control: string | null;
  after: Observation;
};
export type Reproduction = {
  interaction: Interaction;
  expected: string;
  actual: string;
  reproduced: boolean;
};
export type SourceFile = { path: string; text: string };
export type Diagnosis = { cause: string; evidence: string[]; paths: string[] };
export type Edit = { path: string; before: string; after: string };
export type Build = {
  revision: string;
  passed: boolean;
  diagnostics: string[];
};
export type Verification = { passed: boolean; evidence: string[] };
