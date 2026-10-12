// First-agent bootstrap: inline agent config drafts and the deferred-delivery
// machine that holds the first message(s) until the agent it spawns joins.
export {
  DeferredAgentMachine,
  launchStageLabel,
  spawnConfigFromDraft,
} from "./deferred-agent-machine.js";
export { draftForAgent, draftToConfig, pickDefaultModel } from "./agent-config-draft.js";
export type { AgentConfigDraft } from "./agent-config-draft.js";
export type {
  DeferredAgentInputs,
  DeferredAgentSnapshot,
  DeferredAgentState,
  DeferredComposerSend,
  DeferredPublishOptions,
  DeferredSendOptions,
  FirstAgentSetupRequired,
  LaunchStage,
  PendingDelivery,
  PendingDeliveryStatus,
} from "./types.js";
