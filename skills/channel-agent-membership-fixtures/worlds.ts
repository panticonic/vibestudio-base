import type {
  ChannelAgentReport,
  ChannelAgentRequest,
  MembershipReceipt,
  RosterObservation,
} from "../agents/channel-membership/types.js";

export type MembershipWorld = {
  id: string;
  sourceGroup: string;
  request: ChannelAgentRequest;
  roster: readonly RosterObservation[];
  response: MembershipReceipt | "transport-lost" | null;
  expected: ChannelAgentReport;
  expectedWrites: number;
};

const missing = { state: "absent", participantId: null } as const;
const member = {
  state: "member",
  participantId: "owned-worker-participant",
} as const;
const unknown = { state: "unavailable", participantId: null } as const;
const conflict = { state: "conflict", participantId: null } as const;
const acknowledged = {
  outcome: "acknowledged",
  participantId: member.participantId,
} as const;
const removed = { outcome: "acknowledged", participantId: null } as const;
const rejected = { outcome: "rejected", participantId: null } as const;
const defaults = {
  replay: false,
  response: "inherit",
  modelRef: null,
} as const;
const reviews = {
  replay: true,
  response: "mentioned-strict",
  modelRef: "local:lfm3-1.7b",
} as const;

function world(
  name: string,
  group: string,
  request: Pick<ChannelAgentRequest, "action" | "goal" | "options">,
  roster: MembershipWorld["roster"],
  response: MembershipWorld["response"],
  status: ChannelAgentReport["status"],
  final: RosterObservation,
  expectedWrites: number,
): MembershipWorld {
  return {
    id: `channel-agent-${name}`,
    sourceGroup: `vibestudio:agents:${group}`,
    request: {
      ...request,
      channelId: `chat-${name}`,
      contextId: `ctx-${name}`,
      handle: "reviewer",
    },
    roster,
    response,
    expected: {
      status,
      state: final.state,
      participantId: final.participantId,
    },
    expectedWrites,
  };
}

export const channelMembershipWorlds = [
  world(
    "attach-on-empty",
    "initial-attach",
    {
      action: "attach",
      goal: "Put the workspace reviewer in this new planning chat using the workspace defaults.",
      options: defaults,
    },
    [missing, missing, member],
    acknowledged,
    "applied",
    member,
    1,
  ),
  world(
    "strict-review-history",
    "history-policy",
    {
      action: "attach",
      goal: "Add the review specialist for direct mentions and admit eligible prior discussion.",
      options: reviews,
    },
    [missing, missing, member],
    acknowledged,
    "applied",
    member,
    1,
  ),
  world(
    "membership-after-reload",
    "reconcile-existing",
    {
      action: "attach",
      goal: "Make sure the reviewer is still attached after reopening the panel.",
      options: defaults,
    },
    [member],
    null,
    "unchanged",
    member,
    0,
  ),
  world(
    "handle-used-by-different-worker",
    "handle-collision",
    {
      action: "attach",
      goal: "Add our reviewer while preserving the membership of the existing product integration.",
      options: defaults,
    },
    [conflict],
    null,
    "held",
    conflict,
    0,
  ),
  world(
    "missing-attach-options",
    "missing-intent",
    {
      action: "attach",
      goal: "Prepare the reviewer addition while the caller settles replay and response settings.",
      options: null,
    },
    [missing],
    null,
    "held",
    missing,
    0,
  ),
  world(
    "another-operation-completed-attach",
    "concurrent-observation",
    {
      action: "attach",
      goal: "Ensure the agent is subscribed while the chat host may be restoring its saved roster.",
      options: defaults,
    },
    [missing, member, member],
    null,
    "unchanged",
    member,
    0,
  ),
  world(
    "channel-changed-before-attach",
    "concurrent-observation",
    {
      action: "attach",
      goal: "Add the reviewer only if its name is still available in the release chat.",
      options: defaults,
    },
    [missing, conflict, conflict],
    null,
    "held",
    conflict,
    0,
  ),
  world(
    "attach-acknowledgment-lost",
    "ambiguous-commit",
    {
      action: "attach",
      goal: "Reconcile the requested reviewer activation if the launch response is interrupted.",
      options: defaults,
    },
    [missing, missing, member],
    "transport-lost",
    "reconciled",
    member,
    1,
  ),
  world(
    "detach-acknowledgment-lost",
    "ambiguous-commit",
    {
      action: "detach",
      goal: "Remove the reviewer and use the channel roster if the unsubscribe reply disappears.",
      options: null,
    },
    [member, member, missing],
    "transport-lost",
    "reconciled",
    missing,
    1,
  ),
  world(
    "attach-interrupted-without-membership",
    "ambiguous-commit",
    {
      action: "attach",
      goal: "Attempt to activate the reviewer once and report when activation cannot be confirmed.",
      options: defaults,
    },
    [missing, missing, missing],
    "transport-lost",
    "uncertain",
    missing,
    1,
  ),
  world(
    "wrong-acknowledgment-participant",
    "participant-identity",
    {
      action: "attach",
      goal: "Register the assigned reviewer and verify the enrollment receipt against the roster.",
      options: defaults,
    },
    [missing, missing, member],
    { outcome: "acknowledged", participantId: "different-participant" },
    "uncertain",
    member,
    1,
  ),
  world(
    "detach-member",
    "requested-detach",
    {
      action: "detach",
      goal: "Unsubscribe this review worker while leaving the conversation itself available.",
      options: null,
    },
    [member, member, missing],
    removed,
    "applied",
    missing,
    1,
  ),
  world(
    "detach-already-absent",
    "reconcile-existing",
    {
      action: "detach",
      goal: "Make sure the old review worker is absent after the channel was restored.",
      options: null,
    },
    [missing],
    null,
    "unchanged",
    missing,
    0,
  ),
  world(
    "detach-rejected",
    "membership-rejected",
    {
      action: "detach",
      goal: "Remove the reviewer if channel access allows it and report a rejected change accurately.",
      options: null,
    },
    [member, member, member],
    rejected,
    "held",
    member,
    1,
  ),
  world(
    "read-roster-only",
    "read-only-roster",
    {
      action: "inspect",
      goal: "Report whether the reviewer is present without changing the conversation.",
      options: null,
    },
    [member],
    null,
    "observed",
    member,
    0,
  ),
  world(
    "unavailable-roster",
    "unavailable-readback",
    {
      action: "inspect",
      goal: "Confirm the membership of the workspace reviewer without reconstructing the channel.",
      options: null,
    },
    [unknown],
    null,
    "held",
    unknown,
    0,
  ),
  world(
    "unavailable-after-attach",
    "unavailable-readback",
    {
      action: "attach",
      goal: "Add the reviewer and report uncertainty if the new membership cannot be read back.",
      options: defaults,
    },
    [missing, missing, unknown],
    acknowledged,
    "uncertain",
    unknown,
    1,
  ),
];
