declare module "natlang:services" {
  export const gitBridgeReviewRead: {
    observe(operationId: string): Promise<import("./types.js").GitBridgeView>;
  };
}
