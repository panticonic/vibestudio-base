/** One agent channel, and optionally one branch of it. */
export type ChannelRef = {
  /** In agent eval, `chat.channelId` is the channel you are answering in. */
  channelId: string;
  /** Omit for the channel's current branch. */
  branchId?: string;
};

/**
 * How soon a health finding needs attention.
 * - expected: nothing is wrong. Ordinary in-flight work, or a row the documentation calls normal.
 * - investigate: something may be wrong, and a dedicated inspector can say what.
 * - urgent: durable corruption that does not heal: new appends are rejected until it is repaired.
 */
export type Urgency = "expected" | "investigate" | "urgent";

/** One thing the health snapshot shows. */
export type Finding = {
  /**
   * missing-publication-mapping, orphan-publication-mapping, missing-publication-event, missing-publication-envelope,
   * sequence-mismatch, channel-origin-envelopes, duplicate-turn-opened, open-turn, streaming-message, open-invocation,
   * terminal-event-not-projected, oversized-storage, empty-roster.
   */
  kind: string;
  /** How many rows or occurrences the snapshot counted. */
  count: number;
  /** The facts that decide what it means, as plain text. */
  evidence: string;
};

export type JudgedFinding = Finding & {
  urgency: Urgency;
  /** The dedicated inspector that explains this finding, when one exists. */
  next?: string;
};

export type HealthReport = {
  channelId: string;
  branchId: string;
  /** When the snapshot was taken. Take one snapshot; health is not a completion signal, so do not poll. */
  generatedAt: string;
  /** broken when the snapshot reports `durableIntegrityOk` false. */
  integrity: "ok" | "broken";
  /** in-flight means other work is open in the channel; your own eval and turn are excluded. */
  activity: "idle" | "in-flight";
  /** urgent or investigate when any finding says so (or integrity is broken), else busy when in-flight, else healthy. */
  status: "healthy" | "busy" | "investigate" | "urgent";
  findings: JudgedFinding[];
};

/** One envelope of `gad.inspectChannelEnvelopes`, trimmed to what a summary reads. */
export type EnvelopeItem = {
  envelopeId: string;
  /** Position in the channel; the cursor for citing an envelope. */
  seq: number;
  payloadKind?: string;
  /** The sender. */
  from: { kind?: string; id?: string };
  /** The payload with long strings cut to a preview. */
  payloadSummary: unknown;
  publishedAt: string;
};

/** One page of `gad.inspectChannelEnvelopes` (or `collectChannelEnvelopePages`). */
export type EnvelopePage = { items: EnvelopeItem[] };

/** One conversational event, in order. */
export type TimelineEntry = {
  seq: number;
  /** user, agent, or the sender kind otherwise. */
  who: string;
  /** message.completed or message.failed. */
  event: string;
  /** The message text, cut to 400 characters. */
  text: string;
};

/**
 * How the conversation stands, from its last message alone.
 * - agent-replied: the last message is the agent's. Whether it answers or asks the user for something is for the reader
 *   to judge from `lastAgentMessage`.
 * - awaiting-agent: the last message is the user's; the agent has not replied.
 * - failed: the last message failed.
 * - empty: no conversational messages in the pages.
 */
export type Standing = "agent-replied" | "awaiting-agent" | "failed" | "empty";

export type ChannelSummary = {
  /** The envelopes read: first and last seq and how many distinct. */
  range: { fromSeq: number; toSeq: number; envelopes: number };
  /** Envelopes per sender, most active first. */
  senders: { sender: string; envelopes: number }[];
  /** Envelopes per payload kind, most common first. */
  kinds: { kind: string; envelopes: number }[];
  /** The first user message and the last message of the conversation, by seq; absent when there are none. */
  opening?: number;
  latest?: number;
  standing: Standing;
  /** The text of the opening user message and of the last message, cut to 400 characters, for the reader's own recap. */
  openingText?: string;
  latestText?: string;
};

/** The part of a `gad.inspectAgentHealth` snapshot the report reads. */
export type AgentHealth = {
  channelId: string;
  branchId: string;
  generatedAt: string;
  summary: {
    durableIntegrityOk: boolean;
    activity: "idle" | "in-flight";
    activeParticipants: number;
  };
  publicationIntegrity: { summary: Record<string, number>; rows: { envelopeId: string }[] };
  turnState: {
    summary: { openTurns: number; streamingMessages: number; duplicateOpenedTurns: number };
    rows: { turn_id: string; opened_at: string | null; closed_at: string | null }[];
  };
  invocationState: {
    rows: {
      invocation_id: string;
      kind: string | null;
      status: string;
      terminal_outcome: string | null;
      started_events: number;
      terminal_events: number;
    }[];
  };
  roster: { summary: { activeParticipants: number } };
  storage: { rows: { scope: string; id: string; bytes: number }[] };
};
