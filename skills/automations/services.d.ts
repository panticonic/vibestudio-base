declare module "natlang:services" {
  import type { AutomationPlanningSnapshot } from "./types.js";

  export const automationPlanning: {
    inspect(operationId: string): Promise<AutomationPlanningSnapshot>;
  };
}
