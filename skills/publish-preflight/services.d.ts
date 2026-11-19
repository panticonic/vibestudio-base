declare module "natlang:services" {
  export const websiteReadback: {
    observe(): Promise<import("./types.js").WebsiteReviewObservation>;
  };
}
