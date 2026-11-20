export type ItemKey = "1" | "2" | "3";
export type Screen = {
  sessionId: string;
  ptyId: string;
  cols: number;
  rows: number;
  checked: ItemKey[];
};
export type Grants = {
  edit: boolean;
  inspectSuite: boolean;
  restart: boolean;
  interrupt: boolean;
  finish: boolean;
  stage: boolean;
};
export type TerminalStart = {
  screen: Screen;
  grants: Grants;
  note: string | null;
  checkOperationId: string | null;
};
export type ChecklistChange = { item: ItemKey; checked: boolean; input: "key" | "mouse" };
export type TerminalTransition = { operation: "reattach" | "restart" | "resume"; size: "small" | "wide" } |
  { operation: "quit" | "interrupt" | "retire" };
export type NativeExit = { code: number | null; signal: string | null };
export type TerminalEvent = { operation: "change"; change: ChecklistChange; from: Screen; to: Screen } |
  { operation: "reattach" | "restart" | "resume"; from: Screen; to: Screen } |
  { operation: "quit" | "interrupt"; from: Screen; exit: NativeExit } |
  { operation: "retire"; from: Screen; absentFromRegistry: boolean };
export type TerminalHandoff = { path: string; bytes: number; sha256: string };
export type TerminalAction = { kind: "change"; change: ChecklistChange } |
  { kind: "transition"; transition: TerminalTransition } |
  { kind: "check" | "stage" | "finish" };
export type TerminalDisposition = "observed" | "ready" | "held";
export type TerminalSummary = { disposition: TerminalDisposition; explanation: string };
