import type { GitBridgeView } from "./types.js";

declare module "natlang:services" {
  export const gitBridgeReviewRead: {
    observe(operationId: string): Promise<GitBridgeView>;
  };
}
