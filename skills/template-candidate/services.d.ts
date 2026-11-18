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
