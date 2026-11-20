import type { ChecklistChange, RecoveryKnowledge, RecoveryRoute, RecoveryRouteHit, RecoverySkill, TerminalEvent, TerminalHandoff, TerminalStart, TerminalTransition } from "./types.js";
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
  export const openTerminalDiscovery: {
    search(query: string): Promise<RecoveryRouteHit[]>;
    open(id: string): Promise<RecoveryRoute | null>;
    installed(): Promise<RecoverySkill[]>;
    load(dirPath: string, focus: string[]): Promise<RecoveryKnowledge | null>;
  };
}
