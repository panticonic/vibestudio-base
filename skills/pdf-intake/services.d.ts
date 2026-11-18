declare module "natlang:services" {
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
}
