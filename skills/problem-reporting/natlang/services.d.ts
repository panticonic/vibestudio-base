declare module "natlang:services" {
  export const problemDraftRead: {
    observe(operationId: string): Promise<import("./types.js").LocalProblemObservation>;
    confirm(write: import("./types.js").LocalDraftWrite): Promise<import("./types.js").LocalDraftConfirmation>;
  };
  export const problemDraftOpen: {
    create(operationId: string): Promise<import("./types.js").LocalDraft>;
  };
  export const problemDraftAppend: {
    append(
      draft: import("./types.js").LocalDraft,
      sections: import("./types.js").LocalDraftSection[],
    ): Promise<import("./types.js").LocalDraftWrite>;
  };
}
