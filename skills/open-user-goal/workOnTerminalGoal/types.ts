import type { NativeExit, Screen, TerminalEvent, TerminalDiscovery, TerminalHandoff, TerminalSummary } from "./terminal/types.js";
import type { TerminalCheckReport } from "./checks/types.js";
export * from "./terminal/types.js";
export * from "./checks/types.js";

export type TerminalProgress = { events: TerminalEvent[]; checkReport: TerminalCheckReport | null; discovery: TerminalDiscovery | null; handoff: TerminalHandoff | null; refused: boolean };
export type TerminalGoalReport = {
  initial: Screen;
  events: TerminalEvent[];
  checkReport: TerminalCheckReport | null;
  discovery: TerminalDiscovery | null;
  handoff: TerminalHandoff | null;
  summary: TerminalSummary;
};

export type TerminalResult={terminal:Screen|null;exit:NativeExit|null;retired:boolean;checkReport:TerminalCheckReport|null;discovery:TerminalDiscovery|null;handoff:TerminalHandoff|null;summary:TerminalSummary};
