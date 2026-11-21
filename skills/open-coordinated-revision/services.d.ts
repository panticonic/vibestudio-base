import type { RevisionDraft, RevisionReadback, RevisionReceipt, RevisionScope } from "./types.js";
declare module "natlang:services" {
  export const nativeCoordinatedRevision: {
    discover(): Promise<RevisionScope>;
    revise(head: string, drafts: RevisionDraft[]): Promise<RevisionReceipt>;
    readback(): Promise<RevisionReadback>;
  };
}
