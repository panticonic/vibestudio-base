import { describe, expect, it } from "vitest";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  brandId,
  logEnvelopeSemantic,
  type EnvelopeId,
  type LogEnvelope,
} from "@workspace/agentic-protocol";
import {
  GAD_LOG_GENESIS_HASH,
  logChainPreimage,
  wireLogEnvelope,
  type ChainedLogEnvelope,
} from "./logChain.js";

const envelope = (seq: number, prevHash: string): ChainedLogEnvelope => {
  const base: LogEnvelope = {
    logId: "builds",
    head: "main",
    seq,
    envelopeId: brandId<EnvelopeId>(`env-${seq}`),
    actor: { kind: "agent", id: "agent-1" },
    payloadKind: "build.completed",
    payload: { n: seq },
    appendedAt: "2026-06-11T00:00:00.000Z",
  };
  const hash = sha256HexSyncText(
    logChainPreimage({
      prevHash,
      logId: base.logId,
      head: base.head,
      seq,
      semantic: logEnvelopeSemantic(base),
    }),
  );
  return { ...base, prevHash, hash };
};

describe("GAD's private log chain", () => {
  it("links each envelope to the one before it and starts at the genesis hash", () => {
    const first = envelope(1, GAD_LOG_GENESIS_HASH);
    const second = envelope(2, first.hash);
    expect(first.prevHash).toBe("0".repeat(64));
    expect(second.prevHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it("length-prefixes the variable-width fields so a (logId, head, seq) tuple is unambiguous", () => {
    const a = logChainPreimage({ prevHash: "p", logId: "ab", head: "c", seq: 1, semantic: {} });
    const b = logChainPreimage({ prevHash: "p", logId: "a", head: "bc", seq: 1, semantic: {} });
    expect(a).not.toBe(b);
  });

  it("is not part of the wire envelope", () => {
    const wire = wireLogEnvelope(envelope(1, GAD_LOG_GENESIS_HASH));
    expect(Object.keys(wire)).not.toContain("hash");
    expect(Object.keys(wire)).not.toContain("prevHash");
  });
});
