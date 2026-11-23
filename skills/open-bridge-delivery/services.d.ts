declare module "natlang:services" {
  export const branchDeliveryRead: {
    discover(): Promise<import("./types.js").BridgeIndex>;
    inspect(id:string): Promise<import("./types.js").DeliveryScope|null>;
    operation(id:string,path:string): Promise<string|null>;
  };
  export const branchDeliveryWrite: {
    commit(id:string,basis:import("./types.js").DeliveryState): Promise<import("./types.js").LocalDeliveryReceipt|null>;
    retain(report:import("./types.js").BridgeDeliveryReport): Promise<import("./types.js").BranchPrivateNote|null>;
  };
}
