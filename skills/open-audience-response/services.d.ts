import type { AudiencePrepared, AudienceReceipt, AudienceRecord } from "./types.js";
declare module "natlang:services" {
  export const nativeAudienceResponse: {
    readRecord(): Promise<AudienceRecord>;
    render(recordId: string, revision: string, prepared: AudiencePrepared): Promise<AudienceReceipt | null>;
  };
}
