export type AgenticUnit =
  | "panels/chat"
  | "packages/agentic-chat"
  | "workers/agent-worker"
  | "packages/agentic-do"
  | "packages/agentic-protocol"
  | "workers/pubsub-channel"
  | "packages/agentic-core"
  | "packages/pubsub";

export type AgenticChangeRequest = {
  contextId: string;
  goal: string;
};

export type AgenticSourceObservation = {
  contextId: string;
  revision: string;
  guides: { unit: AgenticUnit; excerpt: string | null }[];
};

export type AgenticImpact = {
  owner: AgenticUnit | null;
  consumers: AgenticUnit[];
  persistedContract: boolean;
  retainedHistoryChecks: string[];
  blockers: string[];
};

export type AgenticBuildPlan = {
  focusedTests: AgenticUnit[];
  rebuild: AgenticUnit[];
};

export type AgenticCanaryPlan = {
  surface: "fresh-agent" | "fresh-chat-panel";
  probe: string;
  observations: string[];
  cleanup: string[];
};

export type AgenticChangePlan = {
  contextId: string;
  revision: string;
  impact: AgenticImpact;
  builds: AgenticBuildPlan | null;
  canary: AgenticCanaryPlan | null;
};
