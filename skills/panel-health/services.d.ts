import type { PanelHealthObservation } from "./types.js";

declare module "natlang:services" {
  export const panelHealth: {
    observe(): Promise<PanelHealthObservation>;
    observeAfter(snapshotId: string): Promise<PanelHealthObservation>;
  };
}
