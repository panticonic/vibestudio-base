declare module "natlang:services" {
  export const phoneSetupRead: {
    start(operationId: string): Promise<import("./types.js").SetupStart>;
    discover(prepareReceipt: string): Promise<import("./types.js").DiscoveredPhones>;
    readiness(pairingReceipt: string): Promise<import("./types.js").WorkspaceObservation>;
  };
  export const phoneSetupPrepare: {
    prepare(startReceipt: string, providerId: string): Promise<import("./types.js").PreparedDesktop>;
  };
  export const phoneSetupPair: {
    provision(
      discoveryReceipt: string,
      deviceId: string,
    ): Promise<import("./types.js").PhonePairing>;
  };
}
