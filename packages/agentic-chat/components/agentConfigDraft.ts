/**
 * Agent-config-draft helpers shared by the modal `AgentDialog` and the inline
 * first-agent setup. The framework-free implementation lives in the headless
 * chat core so non-React chat surfaces seed and submit drafts identically.
 */
export { draftForAgent, draftToConfig, pickDefaultModel } from "@workspace/agentic-core/chat-store";
