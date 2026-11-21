import type { ChannelFollowUp, ChannelHealth, ChannelTail } from "./types.js";

declare module "natlang:services" {
  export const clientDiagnostics: {
    discover(): Promise<import("./types.js").ClientCatalog>;
    observe(surfaceId: string): Promise<import("./types.js").ClientView | null>;
    apply(
      viewId: string,
      action: import("./types.js").ClientViewAction,
    ): Promise<import("./types.js").ClientActionReceipt>;
    channel(
      view: import("./types.js").ChannelReviewRequest["view"],
    ): Promise<import("./types.js").ChannelReviewRequest | null>;
    stage(
      audience: string,
      decision: import("./types.js").ClientDecision,
    ): Promise<import("./types.js").ClientHandoff | null>;
  };
  export const gadDurableHistory: {
    read(): Promise<import("./types.js").DurableQuestionHistory>;
  };
  export const gadDurableRoster: {
    read(historyReceipt: string): Promise<import("./types.js").DurableQuestionRoster>;
  };
  export const gadHealth: {
    observe(operationId: string): Promise<ChannelHealth>;
  };
  export const gadFollowUp: {
    inspect(healthReceipt: string, kind: string): Promise<ChannelFollowUp>;
  };
  export const gadConversation: {
    read(operationId: string): Promise<ChannelTail>;
  };
}
