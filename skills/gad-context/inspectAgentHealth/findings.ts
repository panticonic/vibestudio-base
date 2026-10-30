/** List what a health snapshot shows, as plain findings. Counting is exact; judging what they mean is not done here. */
import type { AgentHealth, Finding } from "../types.js";

export default function findings(health: AgentHealth): Finding[] {
  const found: Finding[] = [];
  const add = (kind: string, count: number, evidence: string) => {
    if (count > 0) found.push({ kind, count, evidence });
  };
  const publication = health.publicationIntegrity.summary;
  add(
    "missing-publication-mapping",
    publication["missingMappings"] ?? 0,
    `${publication["missingMappings"]} declared publications have no persisted join`
  );
  add(
    "orphan-publication-mapping",
    publication["orphanMappings"] ?? 0,
    `${publication["orphanMappings"]} joins whose event or envelope no longer exists: ${health.publicationIntegrity.rows
      .slice(0, 3)
      .map((row) => row.envelopeId)
      .join(", ")}`
  );
  add(
    "missing-publication-event",
    publication["missingPublicationEvents"] ?? 0,
    `${publication["missingPublicationEvents"]} published envelopes have no trajectory event`
  );
  add(
    "missing-publication-envelope",
    publication["missingPublicationEnvelopes"] ?? 0,
    `${publication["missingPublicationEnvelopes"]} trajectory publications have no channel envelope`
  );
  add(
    "sequence-mismatch",
    publication["sequenceMismatches"] ?? 0,
    `${publication["sequenceMismatches"]} joins disagree with the envelope's channel sequence`
  );
  add(
    "channel-origin-envelopes",
    publication["channelOriginAgenticEnvelopes"] ?? 0,
    `${publication["channelOriginAgenticEnvelopes"]} agentic envelopes originate in the channel, not a trajectory`
  );
  add(
    "duplicate-turn-opened",
    health.turnState.summary.duplicateOpenedTurns,
    `${health.turnState.summary.duplicateOpenedTurns} turns have a duplicate turn.opened event`
  );
  add(
    "open-turn",
    health.turnState.summary.openTurns,
    `open turns: ${health.turnState.rows
      .filter((row) => row.closed_at === null)
      .map((row) => `${row.turn_id} opened ${row.opened_at ?? "unknown"}`)
      .join("; ")}`
  );
  add(
    "streaming-message",
    health.turnState.summary.streamingMessages,
    `${health.turnState.summary.streamingMessages} messages are started or streaming`
  );
  const open = health.invocationState.rows.filter((row) => row.terminal_events === 0);
  add(
    "open-invocation",
    open.length,
    `open invocations with no terminal event: ${open.map((row) => `${row.invocation_id} (${row.kind ?? "unknown kind"}, status ${row.status}, ${row.started_events} started, 0 terminal)`).join("; ")}`
  );
  const gap = health.invocationState.rows.filter(
    (row) => row.terminal_events > 0 && row.terminal_outcome === null
  );
  add(
    "terminal-event-not-projected",
    gap.length,
    `invocations whose log has a terminal event but whose projection has no terminal outcome: ${gap.map((row) => `${row.invocation_id} (status ${row.status}, ${row.terminal_events} terminal)`).join("; ")}`
  );
  add(
    "oversized-storage",
    health.storage.rows.length,
    `rows over the size limit: ${health.storage.rows
      .slice(0, 5)
      .map((row) => `${row.scope} ${row.id} ${row.bytes} bytes`)
      .join("; ")}`
  );
  add(
    "empty-roster",
    health.roster.summary.activeParticipants === 0 ? 1 : 0,
    "the channel has no active participants"
  );
  return found;
}
