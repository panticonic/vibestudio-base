declare module "natlang:services" {
  export const provenanceHistory: {
    readNext(check: import("./types.js").HistoryCheck): Promise<import("./types.js").HistoryReceipt>;
  };
}
