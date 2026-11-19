export type ItemKey = "1" | "2" | "3";
export type Continuation = "none" | "reattach" | "restart";
export type ChecklistTarget = {
  checked: ItemKey[];
  unchecked: ItemKey[];
};
export type ChecklistExecution = {
  goal: string;
  keys: ItemKey[];
  continuation: Continuation;
};
export type ChecklistRequest =
  | ChecklistExecution
  | { goal: string; continuation: Continuation; target: ChecklistTarget };
export type ChecklistChanges = { check: ItemKey[]; clear: ItemKey[] };
export type ChecklistScreen = {
  sessionId: string;
  ptyId: string;
  cols: number;
  rows: number;
  checked: ItemKey[];
};
export type ChecklistReport = {
  status: "verified" | "mismatch";
  screens: ChecklistScreen[];
  continuation: Continuation;
};
