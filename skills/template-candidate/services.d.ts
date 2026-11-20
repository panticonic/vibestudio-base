declare module "natlang:services" {
  export namespace templateOffer {
    function read(): Promise<import("./types.js").CandidateOffer | null>;
  }
  export namespace templateCandidatePrepare {
    function prepare(): Promise<import("./types.js").StageReceipt>;
  }
  export namespace templateCandidateReview {
    function read(): Promise<import("./types.js").CandidateState | null>;
  }
}

declare module "natlang:services" {
  export const templateMigration: {
    discover(): Promise<import("./types.js").MigrationObservation>;
    read(
      revision: string,
      ids: string[],
    ): Promise<import("./types.js").MigrationRead[] | null>;
    authorizeStage(
      revision: string,
      candidateId: string,
    ): Promise<import("./types.js").CandidateRequest | null>;
    stageHandoff(
      revision: string,
      candidateId: string | null,
      status: import("./types.js").MigrationStatus,
      recipient: string,
    ): Promise<import("./types.js").MigrationHandoff | null>;
  };
}
