declare module "natlang:services" {
  import type { TemplateAuthoringPlan } from "./types.js";

  export const templateAuthoringRead: {
    inspect(operationId: string): Promise<TemplateAuthoringPlan>;
  };
}
