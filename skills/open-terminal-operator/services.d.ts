import type { ChecklistChange, TerminalEvent, TerminalHandoff, TerminalStart, TerminalTransition } from "./types.js";
declare module "natlang:services" {
  export const openTerminalRead: {
    open(): Promise<TerminalStart>;
  };
  export const openTerminalInput: {
    change(request: ChecklistChange): Promise<TerminalEvent | null>;
  };
  export const openTerminalLifecycle: {
    advance(request: TerminalTransition): Promise<TerminalEvent | null>;
  };
  export const openTerminalHandoff: {
    stage(): Promise<TerminalHandoff | null>;
  };
}
