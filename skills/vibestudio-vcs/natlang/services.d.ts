import type { VcsDeliverySnapshot } from "./types.js";

declare module "natlang:services" {
  export const vcsDeliveryRead: {
    observe(operationId: string): Promise<VcsDeliverySnapshot>;
  };
}
