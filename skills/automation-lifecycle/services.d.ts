declare module "natlang:services" {
  export namespace automationLifecycleRead {
    function observe(
      missionId: string,
    ): Promise<import("./types.js").MissionObservation | null>;
  }
  export namespace automationLifecycleChange {
    function apply(
      missionId: string,
      revisionDigest: string,
      action: import("./types.js").LifecycleAction,
    ): Promise<import("./types.js").LifecycleReceipt>;
  }
}
