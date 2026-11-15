import { describe, expect, it } from "vitest";
import {
  brandId,
  logEnvelopeSchema,
  logEnvelopeSemantic,
  storedAgenticEventSchema,
  type EnvelopeId,
  type LogEnvelope,
  type ParticipantRef,
} from "./index.js";

const actor: ParticipantRef = { kind: "agent", id: "agent-1" };

const trajectoryPayloads = [
  { payloadKind: "turn.opened", payload: { protocol: "agentic.trajectory.v1", summary: "start" } },
];

const channelPayloads = [{ payloadKind: "presence", payload: { state: "online", who: "user-1" } }];

describe("log envelope content", () => {
  const envelope = (payloadKind: string, payload: unknown): LogEnvelope => ({
    logId: "traj-1",
    head: "main",
    seq: 1,
    envelopeId: brandId<EnvelopeId>("env-1"),
    actor,
    payloadKind,
    payload,
    appendedAt: "2026-06-11T00:00:00.000Z",
  });

  it("leaves where an event sits (logId, head, seq) out of its canonical content and omits absent optionals", () => {
    const semantic = logEnvelopeSemantic(envelope("turn.opened", trajectoryPayloads[0]!.payload));
    expect(Object.keys(semantic).sort()).toEqual([
      "actor",
      "appendedAt",
      "envelopeId",
      "payload",
      "payloadKind",
    ]);
  });

  it("covers to/annotations/causality in the canonical content when present", () => {
    const enriched: LogEnvelope = {
      ...envelope("turn.opened", trajectoryPayloads[0]!.payload),
      to: { kind: "all" },
      annotations: { agentHops: 1 },
      causality: { originLogId: "traj-0", originEnvelopeId: "env-0", turnId: "turn-1" },
    };
    const semantic = logEnvelopeSemantic(enriched);
    expect(semantic["to"]).toEqual({ kind: "all" });
    expect(semantic["annotations"]).toEqual({ agentHops: 1 });
    expect(semantic["causality"]).toEqual({
      originLogId: "traj-0",
      originEnvelopeId: "env-0",
      turnId: "turn-1",
    });
  });

  it("carries no hash: the strict wire schema refuses one", () => {
    const wire = envelope("presence", channelPayloads[0]!.payload);
    expect(logEnvelopeSchema.safeParse({ ...wire, hash: "f".repeat(64) }).success).toBe(false);
    expect(logEnvelopeSchema.safeParse({ ...wire, prevHash: "f".repeat(64) }).success).toBe(false);
  });
});

describe("logEnvelopeSchema", () => {
  const valid = (): LogEnvelope => ({
    logId: "chan-1",
    head: "main",
    seq: 1,
    envelopeId: brandId<EnvelopeId>("env-1"),
    actor,
    payloadKind: "presence",
    payload: { state: "online", who: "user-1" },
    appendedAt: "2026-06-11T00:00:00.000Z",
  });

  it("parses a valid envelope", () => {
    expect(logEnvelopeSchema.parse(valid())).toEqual(valid());
  });

  it("rejects an empty payloadKind and unknown keys", () => {
    expect(logEnvelopeSchema.safeParse({ ...valid(), payloadKind: "" }).success).toBe(false);
    expect(logEnvelopeSchema.safeParse({ ...valid(), extra: true }).success).toBe(false);
    expect(logEnvelopeSchema.safeParse({ ...valid(), seq: -1 }).success).toBe(false);
  });
});

describe("new event kinds", () => {
  const base = { actor, createdAt: "2026-06-11T00:00:00.000Z" };

  it("parses memory.recalled", () => {
    const event = {
      ...base,
      kind: "memory.recalled",
      payload: {
        protocol: "agentic.trajectory.v1",
        query: "what changed in the build system",
        results: [{ score: 0.9 }],
        anchors: ["env-1"],
        metadata: { recallRun: 1 },
      },
    };
    expect(storedAgenticEventSchema.safeParse(event).success).toBe(true);
  });

  it("parses build.completed", () => {
    const event = {
      ...base,
      kind: "build.completed",
      payload: {
        protocol: "agentic.trajectory.v1",
        inputStateHash: "state:abc",
        subtree: "panels/chat",
        evHash: "ev:123",
        artifactRefs: { bundle: "blob:1" },
        diagnostics: [],
        metadata: { durationMs: 1200 },
      },
    };
    expect(storedAgenticEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects unknown event kinds", () => {
    const event = {
      ...base,
      kind: "memory.unknown",
      payload: { protocol: "agentic.trajectory.v1" },
    };
    expect(storedAgenticEventSchema.safeParse(event).success).toBe(false);
  });
});
