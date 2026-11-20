import type {
  ArchiveCard, ArchiveSnapshot, CurrentArchiveValue, EvidenceRequest, ReconcileDecision, ReconcileEdit, ReconcileEffect, ReconcileView, ReviewWindow,
} from "./types.js";
declare module "natlang:services" {
  export const reconciliationArchive: {
    list(): Promise<ArchiveCard[]>;
    read(id: string): Promise<ArchiveSnapshot | null>;
    readCurrent(id: string, head: string): Promise<CurrentArchiveValue | null>;
  };
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
