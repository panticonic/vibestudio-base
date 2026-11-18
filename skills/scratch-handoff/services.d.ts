declare module "natlang:services" {
  export namespace scratchHandoffRead {
    function read(id: string): Promise<import("./types.js").SourceRead | null>;
  }
  export namespace scratchHandoffWrite {
    function stage(
      body: string,
    ): Promise<import("./types.js").ScratchReceipt | null>;
  }
}
