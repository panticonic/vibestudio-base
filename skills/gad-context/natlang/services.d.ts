import type { ChannelFollowUp, ChannelHealth, ChannelTail } from "./types.js";

declare module "natlang:services" {
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
