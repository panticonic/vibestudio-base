declare module "natlang:services" {
  import type { ChatDeliveryPanel, DeliveryHistoryObservation } from "./types.js";

  export const chatDeliveryPanel: {
    inspect(panelId: string): Promise<ChatDeliveryPanel>;
  };

  export const deliveryHistory: {
    inspect(operationId: string): Promise<DeliveryHistoryObservation>;
  };
}
declare module "natlang:services" {
  export const temporaryNotificationShow: {
    show(operationId: string): Promise<import("./types.js").NotificationAcceptance>;
  };
  export const temporaryNotificationDismiss: {
    dismiss(operationId: string, notificationId: string): Promise<import("./types.js").NotificationDismissal>;
  };
}
