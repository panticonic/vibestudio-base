declare module "natlang:services" {
  export const publicationGoal: {
    discover(): Promise<import("./types.js").PublicationGoalObservation>;
    bind(revision: string, choice: import("./types.js").PublicationGoalChoice): Promise<import("./types.js").PublicationGoalBinding | null>;
  };
  export const websiteReadback: {
    observe(): Promise<import("./types.js").WebsiteReviewObservation>;
  };
  export const publicationRevision: {
    /** Build the caller's current exact website package and compare it to the assigned review. */
    compare(operationId: string): Promise<import("./types.js").PublicationRevisionComparison>;
  };
}
