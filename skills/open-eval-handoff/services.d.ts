declare module "natlang:services" {
  export const openEvalCatalog: {
    discover(): Promise<import("./types.js").EvalJobCard[]>;
    open(jobId: string, runId: string): Promise<import("./types.js").OpenEvalObservation | null>;
  };
  export const openEvalReentry: {
    retry(jobId: string, runId: string): Promise<import("./types.js").OpenEvalObservation | null>;
  };
  export const openEvalHandoff: {
    stage(jobId: string, runId: string): Promise<import("./types.js").EvalHandoffArtifact | null>;
  };
}
