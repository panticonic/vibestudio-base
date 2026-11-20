import type {
  EvidenceRequest, ReconcileDecision, ReconcileEdit, ReconcileEffect, ReconcileView, ReviewWindow,
} from "./types.js";
declare module "natlang:services" {
  export const reconciliationWindow: {
    read(): Promise<ReviewWindow>;
    release(head: string): Promise<EvidenceRequest | null>;
  };
  export const reconciliationNative: {
    observe(): Promise<ReconcileView>;
    apply(head: string, edits: ReconcileEdit[]): Promise<ReconcileEffect>;
    merge(head: string, decisions: ReconcileDecision[]): Promise<ReconcileEffect>;
  };
}
