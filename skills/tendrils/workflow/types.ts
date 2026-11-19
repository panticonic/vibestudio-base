export type TendrilValue = string | number | boolean | null;
export type TendrilField = { key: string; value: TendrilValue };
export type TendrilDevice = {
  id: string;
  platform: "desktop" | "mobile" | "headless";
  online: boolean;
};
export type TendrilStep =
  | { kind: "read" }
  | { kind: "write"; field: TendrilField }
  | { kind: "invoke"; name: string; expected: TendrilField }
  | { kind: "update"; candidate: string; expectedBuild: string }
  | { kind: "restore"; expectedBuild: string };
export type TendrilRequest = {
  goal: string;
  platforms: ("desktop" | "mobile" | "headless")[];
  allowPending: boolean;
  steps: TendrilStep[];
};
export type TendrilPresentation = {
  deviceId: string;
  slotId: string;
  state: "presented" | "pending-device" | "pushed";
};
export type TendrilPage = {
  id: string;
  slotId: string;
  build: string;
  revision: number;
  stored: TendrilField[];
  displayed: TendrilField[];
  exposed: string[];
};
export type TendrilBuildResult = {
  outcome: "proven" | "pending-device" | "failed";
  page: TendrilPage | null;
};
export type TendrilFinding = {
  status: "verified" | "rolled-back" | "blocked";
  evidence: string[];
  page: TendrilPage | null;
};
export type TendrilReport = {
  state: "verified" | "pending" | "blocked";
  presentation: TendrilPresentation | null;
  findings: TendrilFinding[];
};
