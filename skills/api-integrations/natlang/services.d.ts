import type { IntegrationObservation, IntegrationPlan } from "./types.js";

declare module "natlang:services" {
  export const integrationPlanRead: {
    observe(operationId: string): Promise<IntegrationPlan>;
  };
  export const integrationCredentialLookup: {
    resolve(
      planReceipt: string,
      destinationId: string,
    ): Promise<IntegrationObservation>;
  };
}
