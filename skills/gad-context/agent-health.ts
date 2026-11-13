/**
 * The channel health report: what an `inspectAgentHealth` snapshot shows, how soon each finding needs attention, and the
 * inspector that explains it. Exact code over the snapshot's typed rows (see DIAGNOSTICS.md); it takes the snapshot and
 * does not read anything itself.
 */
import type { AgentHealth, Finding, HealthReport, JudgedFinding, Urgency } from "./types.js";

/** List what a health snapshot shows, as plain findings. Counting is exact; judging what they mean is done by the policy below. */
export function listFindings(health: AgentHealth): Finding[] {
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

// The policy: what each kind of finding means and which inspector explains it (DIAGNOSTICS.md). It is an exact function
// of the kind, which already says whether work is merely in progress, a join is broken, or the log cannot heal. Age is
// deliberately not an input: elapsed time alone does not establish failure.

/** Work in progress and rows the documentation calls usual: not failures, however many there are. */
const EXPECTED = new Set([
  "open-turn",
  "streaming-message",
  "open-invocation",
  "channel-origin-envelopes",
]);

/** The log is corrupt in a way that does not heal: a duplicate turn.opened rejects every new append. */
const URGENT = new Set(["duplicate-turn-opened"]);

/** An unknown kind is something to look at, never something to ignore. */
export function urgencyOf(kind: string): Urgency {
  return URGENT.has(kind) ? "urgent" : EXPECTED.has(kind) ? "expected" : "investigate";
}

const NEXT: Record<string, string | undefined> = {
  "missing-publication-mapping": "inspectPublicationIntegrity",
  "orphan-publication-mapping": "inspectPublicationIntegrity",
  "missing-publication-event": "inspectPublicationIntegrity",
  "missing-publication-envelope": "inspectPublicationIntegrity",
  "sequence-mismatch": "inspectPublicationIntegrity",
  "duplicate-turn-opened": "inspectTurnState",
  "open-turn": "inspectTurnState",
  "streaming-message": "inspectTurnState",
  "open-invocation": "inspectInvocationState",
  "terminal-event-not-projected": "inspectInvocationState",
  "oversized-storage": "inspectStorageDiagnostics",
  "empty-roster": "inspectChannelRoster",
};

/** The dedicated gad inspector that explains a kind of finding, when there is one. */
export function nextInspector(kind: string): string | undefined {
  return NEXT[kind];
}

/** The report of one snapshot: its findings, each with its urgency and the inspector to run next, and the overall status. */
export function reportAgentHealth(health: AgentHealth): HealthReport {
  const judged: JudgedFinding[] = listFindings(health).map((finding) => {
    const target = nextInspector(finding.kind);
    return { ...finding, urgency: urgencyOf(finding.kind), ...(target ? { next: target } : {}) };
  });
  const integrity = health.summary.durableIntegrityOk ? "ok" : "broken";
  const status = judged.some((f) => f.urgency === "urgent")
    ? "urgent"
    : judged.some((f) => f.urgency === "investigate") || integrity === "broken"
      ? "investigate"
      : health.summary.activity === "in-flight"
        ? "busy"
        : "healthy";
  return {
    channelId: health.channelId,
    branchId: health.branchId,
    generatedAt: health.generatedAt,
    integrity,
    activity: health.summary.activity,
    status,
    findings: judged,
  };
}
