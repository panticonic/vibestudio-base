/**
 * What each kind of finding means and which inspector explains it (skills/gad-context/DIAGNOSTICS.md). The policy is an
 * exact function of the kind: the kinds already say whether work is merely in progress, a join is broken, or the log
 * cannot heal. A small model asked to judge them did worse than this table (see DECOMPOSITION.md).
 */
import type { Urgency } from "../types.js";

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
