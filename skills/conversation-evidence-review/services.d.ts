declare module "natlang:services" {
  import type { DeliveryHistoryObservation } from "./types.js";

  export const deliveryHistory: {
    inspect(operationId: string): Promise<DeliveryHistoryObservation>;
  };
}
