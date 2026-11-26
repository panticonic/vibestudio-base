import type { TerminalEvent, TerminalDiscovery, TerminalHandoff } from "./terminal/types.js";
import type { TerminalCheckReport } from "./checks/types.js";
export * from "./terminal/types.js";
export * from "./checks/types.js";

export type TerminalProgress = { events: TerminalEvent[]; checkReport: TerminalCheckReport | null; discovery: TerminalDiscovery | null; handoff: TerminalHandoff | null; refused: boolean };
export type TerminalFindings = { answer: string };
