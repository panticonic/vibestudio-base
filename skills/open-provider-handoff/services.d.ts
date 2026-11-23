declare module "natlang:services" {
  export const retainedConversationIndex: { list(): Promise<import("./types.js").ConversationCard[]> };
  export const retainedConversationState: { read(channelId: string): Promise<import("./types.js").ConversationRead | null> };
  export const retainedProviderOutput: { read(channelId: string, resultMessage: string): Promise<import("./types.js").OutputReadback | null> };
  export const retainedProviderHandoff: { stage(plan: import("./types.js").ProviderPlan): Promise<import("./types.js").ProviderHandoff | null> };
}
