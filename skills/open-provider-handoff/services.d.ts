import type { ConversationCard, ConversationRead, OutputReadback, ProviderHandoff, ProviderPlan } from "./types.js";
declare module "natlang:services" {
  export const retainedConversationIndex: { list(): Promise<ConversationCard[]> };
  export const retainedConversationState: { read(channelId: string): Promise<ConversationRead | null> };
  export const retainedProviderOutput: { read(channelId: string, resultMessage: string): Promise<OutputReadback | null> };
  export const retainedProviderHandoff: { stage(plan: ProviderPlan): Promise<ProviderHandoff | null> };
}
