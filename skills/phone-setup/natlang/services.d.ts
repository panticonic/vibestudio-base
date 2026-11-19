import type {
  DiscoveredPhones,
  PhonePairing,
  PreparedDesktop,
  SetupStart,
  WorkspaceObservation,
} from "./types.js";

declare module "natlang:services" {
  export const phoneSetupRead: {
    start(operationId: string): Promise<SetupStart>;
    discover(prepareReceipt: string): Promise<DiscoveredPhones>;
    readiness(pairingReceipt: string): Promise<WorkspaceObservation>;
  };
  export const phoneSetupPrepare: {
    prepare(startReceipt: string, providerId: string): Promise<PreparedDesktop>;
  };
  export const phoneSetupPair: {
    provision(
      discoveryReceipt: string,
      deviceId: string,
    ): Promise<PhonePairing>;
  };
}
