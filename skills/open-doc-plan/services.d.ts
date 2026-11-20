declare module "natlang:services" {
  export const docPlanContext: {
    observe(): Promise<import("./types.js").PlanningState>;
  };
  export const docPlanHandoff: {
    stage(plan: import("./types.js").CapabilityPlan): Promise<import("./types.js").CapabilityHandoff | null>;
  };
  export const docPlanCatalog: {
    search(query: import("./types.js").CatalogQuery): Promise<import("./types.js").DocHit[]>;
    describe(id: string): Promise<import("./types.js").DetailedCapability | null>;
    overview(): Promise<import("./types.js").ServiceOverview>;
    availableMethod(name: string): Promise<boolean>;
  };
  export const docPlanSkills: {
    load(dirPath: string, focus: string[]): Promise<import("./types.js").InstalledKnowledge | null>;
  };
}
