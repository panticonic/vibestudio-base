import type { PanelHealthObservation } from "./types.js";

declare module "natlang:services" {
  export const panelHealth: {
    observe(): Promise<PanelHealthObservation>;
    observeAfter(snapshotId: string): Promise<PanelHealthObservation>;
  };
  export const panelRecovery: {
    discover(): Promise<import("./types.js").RecoveryCatalog>;
    bind(revision: string, surfaceId: string): Promise<import("./types.js").RecoveryBinding | null>;
    inspect(): Promise<import("./types.js").RecoveryView>;
    apply(revision: string, action: import("./types.js").RecoveryAction): Promise<import("./types.js").RecoveryEffect>;
  };
}
