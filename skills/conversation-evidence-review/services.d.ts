declare module "natlang:services" {
  import type { ChatDeliveryPanel, DeliveryHistoryObservation } from "./types.js";

  export const chatDeliveryPanel: {
    inspect(panelId: string): Promise<ChatDeliveryPanel>;
  };

  export const deliveryHistory: {
    inspect(operationId: string): Promise<DeliveryHistoryObservation>;
  };
}
