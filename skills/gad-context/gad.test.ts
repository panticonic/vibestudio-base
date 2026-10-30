import { describe, expect, it } from "vitest";
import findings from "./inspectAgentHealth/findings.js";
import { nextInspector, urgencyOf } from "./inspectAgentHealth/policy.js";
import collectSummary from "./summarizeChannel/collect.js";
import timeline from "./summarizeChannel/timeline.js";
import type { AgentHealth, EnvelopeItem } from "./types.js";

const health = (overrides: Partial<AgentHealth> = {}): AgentHealth => ({
  channelId: "chan_1",
  branchId: "main",
  generatedAt: "2026-10-30T15:42:10.000Z",
  summary: { durableIntegrityOk: true, activity: "idle", activeParticipants: 2 },
  publicationIntegrity: { summary: {}, rows: [] },
  turnState: { summary: { openTurns: 0, streamingMessages: 0, duplicateOpenedTurns: 0 }, rows: [] },
  invocationState: { rows: [] },
  roster: { summary: { activeParticipants: 2 } },
  storage: { rows: [] },
  ...overrides,
});

describe("findings", () => {
  it("lists nothing for a quiet channel", () => {
    expect(findings(health())).toEqual([]);
  });

  it("counts publication problems and names orphan envelopes", () => {
    const found = findings(
      health({
        publicationIntegrity: {
          summary: { missingMappings: 2, orphanMappings: 1, sequenceMismatches: 0 },
          rows: [{ envelopeId: "env_0c41" }],
        },
      })
    );
    expect(found.map((finding) => [finding.kind, finding.count])).toEqual([
      ["missing-publication-mapping", 2],
      ["orphan-publication-mapping", 1],
    ]);
    expect(found[1]?.evidence).toContain("env_0c41");
  });

  it("separates running invocations from a terminal event that never reached the projection", () => {
    const found = findings(
      health({
        invocationState: {
          rows: [
            {
              invocation_id: "inv_1",
              kind: "eval",
              status: "running",
              terminal_outcome: null,
              started_events: 1,
              terminal_events: 0,
            },
            {
              invocation_id: "inv_2",
              kind: "eval",
              status: "running",
              terminal_outcome: null,
              started_events: 1,
              terminal_events: 1,
            },
            {
              invocation_id: "inv_3",
              kind: "eval",
              status: "completed",
              terminal_outcome: "ok",
              started_events: 1,
              terminal_events: 1,
            },
          ],
        },
      })
    );
    expect(found.map((finding) => [finding.kind, finding.count])).toEqual([
      ["open-invocation", 1],
      ["terminal-event-not-projected", 1],
    ]);
  });

  it("reports an empty roster and oversized rows", () => {
    const found = findings(
      health({
        roster: { summary: { activeParticipants: 0 } },
        storage: { rows: [{ scope: "log_events", id: "ev_1", bytes: 41_000_000 }] },
      })
    );
    expect(found.map((finding) => finding.kind)).toEqual(["oversized-storage", "empty-roster"]);
  });
});

describe("policy", () => {
  it("names the inspector that explains a finding, and none for an expected one", () => {
    expect(nextInspector("duplicate-turn-opened")).toBe("inspectTurnState");
    expect(nextInspector("oversized-storage")).toBe("inspectStorageDiagnostics");
    expect(nextInspector("channel-origin-envelopes")).toBeUndefined();
  });

  it("calls work in progress expected, a duplicate turn.opened urgent, and everything else worth investigating", () => {
    for (const kind of [
      "open-turn",
      "streaming-message",
      "open-invocation",
      "channel-origin-envelopes",
    ]) {
      expect(urgencyOf(kind), kind).toBe("expected");
    }
    expect(urgencyOf("duplicate-turn-opened")).toBe("urgent");
    for (const kind of [
      "missing-publication-mapping",
      "terminal-event-not-projected",
      "empty-roster",
      "a-kind-from-the-future",
    ]) {
      expect(urgencyOf(kind), kind).toBe("investigate");
    }
  });
});

const message = (
  seq: number,
  who: "user" | "agent",
  text: unknown,
  kind = "message.completed"
): EnvelopeItem => ({
  envelopeId: `env_${seq}`,
  seq,
  payloadKind: "agentic.trajectory.v1/event",
  from: { kind: who, id: `${who}_1` },
  payloadSummary: {
    kind,
    payload: {
      role: who === "user" ? "user" : "assistant",
      blocks: [{ type: "text", content: text }],
    },
  },
  publishedAt: "2026-10-30T14:00:00.000Z",
});

describe("timeline", () => {
  it("merges overlapping pages by seq and keeps only the conversation", () => {
    const presence: EnvelopeItem = {
      envelopeId: "env_1",
      seq: 1,
      payloadKind: "presence",
      from: { kind: "user", id: "user_1" },
      payloadSummary: {},
      publishedAt: "",
    };
    const flat = timeline([
      { items: [presence, message(2, "user", "How many panels?")] },
      { items: [message(2, "user", "How many panels?"), message(3, "agent", "There are 17.")] },
    ]);
    expect(flat.items.map((item) => item.seq)).toEqual([1, 2, 3]);
    expect(flat.timeline.map((entry) => [entry.seq, entry.who, entry.text])).toEqual([
      [2, "user", "How many panels?"],
      [3, "agent", "There are 17."],
    ]);
    expect(flat.kinds).toEqual([
      { kind: "message.completed", envelopes: 2 },
      { kind: "presence", envelopes: 1 },
    ]);
  });

  it("reads a long block through its preview", () => {
    const flat = timeline([
      {
        items: [message(1, "agent", { type: "string", chars: 900, preview: "Changelog for 2.4" })],
      },
    ]);
    expect(flat.timeline[0]?.text).toBe("Changelog for 2.4…");
  });
});

describe("summarizeChannel.collect", () => {
  it("reads how the conversation stands from its last message, and cites the opening and the latest", () => {
    const pages = [
      {
        items: [
          message(2, "user", "Rename foo to total."),
          message(3, "agent", "Done. Let me know if you want more."),
        ],
      },
    ];
    expect(collectSummary(pages)).toMatchObject({
      range: { fromSeq: 2, toSeq: 3, envelopes: 2 },
      standing: "agent-replied",
      opening: 2,
      latest: 3,
      latestText: "Done. Let me know if you want more.",
    });
    expect(collectSummary([{ items: [message(2, "user", "Hello")] }]).standing).toBe(
      "awaiting-agent"
    );
    expect(
      collectSummary([
        { items: [message(2, "user", "Hi"), message(3, "agent", "x", "message.failed")] },
      ]).standing
    ).toBe("failed");
    expect(collectSummary([{ items: [] }])).toMatchObject({
      standing: "empty",
      range: { envelopes: 0 },
    });
  });
});
