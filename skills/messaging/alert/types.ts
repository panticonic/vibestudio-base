/** A message the agent is about to send with `notify`, described before sending. */
export type Outgoing = {
  /** Who receives it: "channel" (everyone in this conversation), "person" (a human), "supervisor" (the parent agent), "subagent" (a run this agent spawned), "other-agent" (an agent in another conversation). */
  recipient: "channel" | "person" | "supervisor" | "subagent" | "other-agent";
  /** The message text. */
  content: string;
  /** What the recipient or the user said about being notified, in their words; null when nothing was said. */
  stated_preference: string | null;
};

/** What the recipient experiences: only the message (none), plus a durable inbox entry and phone push (inbox), plus a toast on whatever they are doing (interrupt). */
export type AlertRung = "none" | "inbox" | "interrupt";
