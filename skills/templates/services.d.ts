declare module "natlang:services" {
  export const templateAuthoringRead: {
    inspect(operationId: string): Promise<import("./types.js").TemplateAuthoringPlan>;
  };
}
