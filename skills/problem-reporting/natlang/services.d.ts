import type {
  LocalDraft,
  LocalDraftConfirmation,
  LocalDraftSection,
  LocalDraftWrite,
  LocalProblemObservation,
} from "./types.js";

declare module "natlang:services" {
  export const problemDraftRead: {
    observe(operationId: string): Promise<LocalProblemObservation>;
    confirm(write: LocalDraftWrite): Promise<LocalDraftConfirmation>;
  };
  export const problemDraftOpen: {
    create(operationId: string): Promise<LocalDraft>;
  };
  export const problemDraftAppend: {
    append(
      draft: LocalDraft,
      sections: LocalDraftSection[],
    ): Promise<LocalDraftWrite>;
  };
}
