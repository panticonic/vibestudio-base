export type ItemKey = "1" | "2" | "3";
export type Continuation = "none" | "reattach" | "restart";
export type ChecklistRequest = {
  goal: string;
  keys: ItemKey[];
  continuation: Continuation;
};
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
