declare module "natlang:services" {
  export const chatDeliveryPanel: {
    inspect(panelId: string): Promise<import("./types.js").ChatDeliveryPanel>;
  };

  export const deliveryHistory: {
    inspect(operationId: string): Promise<import("./types.js").DeliveryHistoryObservation>;
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
