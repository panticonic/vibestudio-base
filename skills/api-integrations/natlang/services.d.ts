declare module "natlang:services" {
  export const integrationPlanRead: {
    observe(operationId: string): Promise<import("./types.js").IntegrationPlan>;
  };
  export const integrationCredentialLookup: {
    resolve(
      planReceipt: string,
      destinationId: string,
    ): Promise<import("./types.js").IntegrationObservation>;
  };
}
