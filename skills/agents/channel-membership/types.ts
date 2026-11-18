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
  status: "observed" | "unchanged" | "applied" | "held" | "uncertain";
  state: RosterStatus;
  participantId: string | null;
};
