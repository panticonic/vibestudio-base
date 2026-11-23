declare module "natlang:services" {
  export const vcsDeliveryRead: {
    observe(operationId: string): Promise<import("./types.js").VcsDeliverySnapshot>;
  };
}
