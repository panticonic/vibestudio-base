import type { AssemblyBuildReceipt, AssemblyHandoff, AssemblyInventory, AssemblyPlan, AssemblyRevision, UnitSource } from "./types.js";

declare module "natlang:services" {
  export const assemblyInventory: { observe(): Promise<AssemblyInventory> };
  export const assemblySource: { read(unit: string, head: AssemblyRevision): Promise<UnitSource | null> };
  export const assemblyBuild: { verify(unit: string, head: AssemblyRevision): Promise<AssemblyBuildReceipt | null> };
  export const assemblyDraft: { stage(plan: AssemblyPlan): Promise<AssemblyHandoff | null> };
}
