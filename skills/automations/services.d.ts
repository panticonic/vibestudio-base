declare module "natlang:services" {
  export const automationPlanning: {
    inspect(operationId: string): Promise<import("./types.js").AutomationPlanningSnapshot>;
  };
}
