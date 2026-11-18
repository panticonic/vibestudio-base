export type Request = { goal: string };
export type Coordinate = { kind: "file" | "repository"; id: string };
export type File = { path: string; text: string };
export type Snapshot = {
  head: string;
  source: string;
  currentIntent: string[];
  sourceIntent: string[];
  coordinates: Coordinate[];
  files: File[];
  remaining: Coordinate[];
  evidence: string[];
};
export type IntentAnalysis = {
  requiredCurrent: string[];
  requiredSource: string[];
  preserve: string[];
  compatible: boolean;
  evidence: string[];
  missing: string[];
};
export type Edit = { path: string; before: string; after: string };
export type Decision = {
  coordinate: Coordinate;
  resolution: "composed" | "theirs" | "ours" | "current";
  rationale: string;
};
export type Plan = {
  edits: Edit[];
  decisions: Decision[];
  rationale: string[];
  blocker: string | null;
};
export type Verification = {
  passed: boolean;
  evidence: string[];
  missing: string[];
};
export type Report = {
  status: "integrated" | "blocked";
  head: string;
  evidence: string[];
  detail: string;
};
