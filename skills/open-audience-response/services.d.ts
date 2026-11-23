declare module "natlang:services" {
  export const nativeAudienceResponse: {
    readRecord(): Promise<import("./types.js").AudienceRecord>;
    render(recordId: string, revision: string, prepared: import("./types.js").AudiencePrepared): Promise<import("./types.js").AudienceReceipt | null>;
  };
}
