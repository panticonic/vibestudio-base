import type { BridgeDeliveryReport, BridgeIndex, BranchPrivateNote, DeliveryScope, DeliveryState, LocalDeliveryReceipt } from "./types.js";
declare module "natlang:services" {
  export const branchDeliveryRead: {
    discover(): Promise<BridgeIndex>;
    inspect(id:string): Promise<DeliveryScope|null>;
    operation(id:string,path:string): Promise<string|null>;
  };
  export const branchDeliveryWrite: {
    commit(id:string,basis:DeliveryState): Promise<LocalDeliveryReceipt|null>;
    retain(report:BridgeDeliveryReport): Promise<BranchPrivateNote|null>;
  };
}
