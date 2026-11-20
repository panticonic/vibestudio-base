import type {
  Screen, TerminalDiscovery, TerminalAction as Action, TerminalEvent as Event, TerminalHandoff, TerminalStart as Start,
  TerminalSummary as Summary,
} from "./terminal/types.js";
import type { TerminalCheckReport } from "./checks/types.js";

export type TerminalStart = Start;
export type TerminalEvent = Event;
export type TerminalAction = Action;
export type TerminalSummary = Summary;
export type TerminalProgress = { events: Event[]; checkReport: TerminalCheckReport | null; discovery: TerminalDiscovery | null; handoff: TerminalHandoff | null; refused: boolean };
export type TerminalGoalReport = {
  initial: Screen;
  events: Event[];
  checkReport: TerminalCheckReport | null;
  discovery: TerminalDiscovery | null;
  handoff: TerminalHandoff | null;
  summary: Summary;
};
