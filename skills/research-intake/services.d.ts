declare module "natlang:services" {
  export const assignedResearchIntake: {
    read(operationId: string): Promise<import("./types.js").ResearchIntakeRequest>;
  };
}
