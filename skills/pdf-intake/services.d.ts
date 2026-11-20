declare module "natlang:services" {
  export const pdfGoalDocuments: {
    discover(): Promise<import("./types.js").PdfGoalObservation>;
    bind(revision: string, selection: import("./types.js").PdfGoalSelection): Promise<import("./types.js").PdfGoalBinding | null>;
  };
  export const pdfGoalVisual: {
    render(operationId: string, pageNumber: number): Promise<import("./types.js").PdfGoalRender>;
  };
  export namespace pdfIntakeProbe {
    function probe(
      document: string,
    ): Promise<import("./types.js").ProbeReceipt>;
  }
  export namespace pdfIntakeRead {
    function read(
      document: string,
      pages: number[],
      mode: import("./types.js").ExtractionMode,
    ): Promise<import("./types.js").BatchReceipt>;
  }
  export const pdfLayoutRead: {
    inspect(operationId: string): Promise<import("./types.js").PdfLayoutPage>;
  };
}
