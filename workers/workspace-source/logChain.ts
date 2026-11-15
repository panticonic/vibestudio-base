import { canonicalJson } from "@vibestudio/content-addressing";
import { GENESIS_EVENT_HASH, type LogEnvelope } from "@workspace/agentic-protocol";

/**
 * GAD's private hash chain over its own logs (`log_events.hash`, `prev_hash`, the head pointer).
 *
 * The chain is GAD's, not the protocol's: a channel keeps no hash (its commit history commits its
 * whole state), and the wire envelope carries none. GAD still checks the chain of the logs it owns
 * until its log machinery is replaced by the commit graph (P5); nothing outside this worker reads it.
 */
export const GAD_LOG_GENESIS_HASH = GENESIS_EVENT_HASH;

/** Preimage format version. v2 length-prefixes the variable-width fields so distinct (logId, head, seq) tuples never share a preimage. */
export const GAD_LOG_HASH_FORMAT = 2;

/** A stored envelope with its place in the chain. It never leaves the worker: `wireLogEnvelope` strips it. */
export type ChainedLogEnvelope = LogEnvelope & { prevHash: string; hash: string };

export function wireLogEnvelope(envelope: ChainedLogEnvelope): LogEnvelope {
  const { prevHash: _prevHash, hash: _hash, ...wire } = envelope;
  return wire;
}

export interface LogChainInput {
  prevHash: string;
  logId: string;
  head: string;
  seq: number;
  semantic: Record<string, unknown>;
}

/** The one preimage construction for GAD's envelope hashes. */
export function logChainPreimage(input: LogChainInput): string {
  return [
    `gadlog:${GAD_LOG_HASH_FORMAT}`,
    input.prevHash,
    `${input.logId.length}:${input.logId}`,
    `${input.head.length}:${input.head}`,
    String(input.seq),
    canonicalJson(input.semantic),
  ].join("\n");
}
