export type AgentAction = "attach" | "detach" | "inspect";
export type AttachOptions = {
  replay: boolean;
  response: "inherit" | "mentioned-strict";
  modelRef: string | null;
};

export type ChannelAgentRequest = {
  goal: string;
  channelId: string;
  contextId: string;
  handle: string;
  action: AgentAction;
  options: AttachOptions | null;
};

export type RosterStatus = "member" | "absent" | "conflict" | "unavailable";
export type RosterObservation = {
  state: RosterStatus;
  participantId: string | null;
};

export type MembershipDecision = "attach" | "detach" | "confirm" | "hold";
export type MembershipReceipt = {
  outcome: "acknowledged" | "already" | "blocked" | "rejected" | "uncertain";
  participantId: string | null;
};

export type ChannelAgentReport = {
  status:
    | "observed"
    | "unchanged"
    | "applied"
    | "reconciled"
    | "held"
    | "uncertain";
  state: RosterStatus;
  participantId: string | null;
};

export type RosterPlanStep = {
  id: string;
  request: ChannelAgentRequest;
};
export type RosterPlanRequest = {
  goal: string;
  steps: RosterPlanStep[];
};
export type RosterPlanFinding = {
  id: string;
  result: ChannelAgentReport | null;
  blockedBy: string | null;
};
export type RosterPlanReport = { findings: RosterPlanFinding[] };
