declare module "natlang:services" {
  export const openTerminalRead: {
    open(): Promise<import("./types.js").TerminalStart>;
  };
  export const openTerminalInput: {
    change(request: import("./types.js").ChecklistChange): Promise<import("./types.js").TerminalEvent | null>;
  };
  export const openTerminalLifecycle: {
    advance(request: import("./types.js").TerminalTransition): Promise<import("./types.js").TerminalEvent | null>;
  };
  export const openTerminalHandoff: {
    stage(): Promise<import("./types.js").TerminalHandoff | null>;
  };
  export const openTerminalDiscovery: {
    search(query: string): Promise<import("./types.js").RecoveryRouteHit[]>;
    open(id: string): Promise<import("./types.js").RecoveryRoute | null>;
    installed(): Promise<import("./types.js").RecoverySkill[]>;
    load(dirPath: string, focus: string[]): Promise<import("./types.js").RecoveryKnowledge | null>;
  };
}
