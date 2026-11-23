declare module "natlang:services" {
  export const assemblyInventory: { observe(): Promise<import("./types.js").AssemblyInventory> };
  export const assemblySource: { read(unit: string, head: import("./types.js").AssemblyRevision): Promise<import("./types.js").UnitSource | null> };
  export const assemblyBuild: { verify(unit: string, head: import("./types.js").AssemblyRevision): Promise<import("./types.js").AssemblyBuildReceipt | null> };
  export const assemblyDraft: { stage(plan: import("./types.js").AssemblyPlan): Promise<import("./types.js").AssemblyHandoff | null> };
}
