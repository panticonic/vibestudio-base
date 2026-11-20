declare module "natlang:services" {
  export const programRunCatalog: {
    list(): Promise<import("./types.js").RunProgram[]>;
    inspect(programId: string): Promise<import("./types.js").RunInspection | null>;
  };
  export const programExecution: {
    run(programId: string, revision: string, sampleId: string): Promise<import("./types.js").StartedRun | null>;
    read(receiptId: string): Promise<import("./types.js").ProgramOutputReceipt | null>;
  };
  export const programReceiptSigner: {
    stage(receiptId: string): Promise<import("./types.js").SignedOutputReceipt | null>;
  };
}
