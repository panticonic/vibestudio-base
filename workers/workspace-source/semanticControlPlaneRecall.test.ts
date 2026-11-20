/** Builtin recall deduplication across copied trajectory and channel projections. */
import { describe, expect, it, beforeEach } from "vitest";
import { createTestDO } from "@vibestudio/durable/test-utils";
import {
  headForChannel,
  logIdForChannel,
} from "@vibestudio/trajectory-identity";
import { GadWorkspaceDO } from "./index.js";

type TestGad = Awaited<ReturnType<typeof createTestDO<typeof GadWorkspaceDO>>>;
type PrivateReach = {
  indexMemoryRow(row: {
    text: string;
    kind: "message" | "file" | "commit";
    logId?: string | null;
    head?: string | null;
    eventId?: string | null;
    path?: string | null;
    contentHash?: string | null;
    anchor?: Record<string, unknown> | null;
  }): void;
};
const reach = (doi: GadWorkspaceDO): PrivateReach =>
  doi as unknown as PrivateReach;

describe("GadWorkspaceDO — recall deduplication", () => {
  let gad: TestGad;
  let doi: GadWorkspaceDO;

  beforeEach(async () => {
    gad = await createTestDO(GadWorkspaceDO, {
      __objectKey: "gad-recall-soft",
    });
    doi = gad.instance;
  });

  it("recalls a native published commit without a row in the legacy event table", () => {
    const document = {
      eventId: "event:native-config", revision: "c".repeat(40),
      text: "Keep the Northstar configuration after rollout",
      createdAt: "2026-08-14T00:00:00.000Z",
    };
    expect(doi.recordHistoryCommitMemory(document)).toBe(true);
    expect(doi.recordHistoryCommitMemory(document)).toBe(true);
    expect(doi.recallMemory({ query: "Northstar", kinds: ["commit"] }).results).toMatchObject([{
      kind: "commit", eventId: document.eventId, appendedAt: document.createdAt,
      anchor: { workspaceEventId: document.eventId, revision: document.revision },
    }]);
  });

  it("commits native recall documents and the page marker atomically", () => {
    const document = {
      eventId: "event:batch", revision: "d".repeat(40), text: "Private fixture batch summary",
      createdAt: "2026-08-14T00:00:00.000Z",
    };
    const marker = JSON.stringify({ completedEventId: document.eventId, pending: null });
    const page = { previousMarker: null, marker, documents: [document] };
    expect(() => doi.recordHistoryCommitMemoryPage({
      ...page, documents: [document, { ...document, createdAt: "invalid" }],
    })).toThrow("Invalid native commit memory");
    expect(doi.readHistoryCommitMemoryIndex()).toBeNull();
    expect(doi.recallMemory({ query: "batch summary", kinds: ["commit"] }).results).toEqual([]);
    expect(doi.recordHistoryCommitMemoryPage(page)).toBe(true);
    expect(doi.readHistoryCommitMemoryIndex()).toBe(marker);
    expect(() => doi.recordHistoryCommitMemoryPage(page)).toThrow("index advanced concurrently");
    expect(doi.recallMemory({ query: "batch summary", kinds: ["commit"] }).results)
      .toMatchObject([{ eventId: document.eventId }]);
  });

  it("keeps protected Dolt documents when rebuilding conversation projections", async () => {
    const document = {
      eventId: "event:published", revision: "a".repeat(40),
      text: "Northstar protected revision", createdAt: "2026-08-14T00:00:00.000Z",
    };
    const marker = JSON.stringify({ completedEventId: document.eventId, pending: null });
    doi.recordHistoryCommitMemoryPage({ previousMarker: null, marker, documents: [document] });
    reach(doi).indexMemoryRow({
      kind: "commit", eventId: "event:unverified", text: "Northstar unverified revision",
    });

    await doi.rebuildTrajectoryProjections();
    expect(doi.readHistoryCommitMemoryIndex()).toBe(marker);
    expect(doi.recallMemory({ query: "Northstar", kinds: ["commit"] }).results)
      .toMatchObject([{ eventId: document.eventId, anchor: { revision: document.revision } }]);
  });

  it("dedup keeps the page full: a duplicate copy is collapsed without stealing a slot", () => {
    // Six distinct items sharing the term "widget", each a distinct event id.
    for (let i = 1; i <= 6; i += 1) {
      reach(doi).indexMemoryRow({
        text: `widget number ${["one", "two", "three", "four", "five", "six"][i - 1]}`,
        kind: "message",
        logId: "traj:D",
        head: "h-main",
        eventId: `e-w${i}`,
      });
    }
    // A published/fork COPY of the first item: same (kind, event_id), other head.
    reach(doi).indexMemoryRow({
      text: "widget number one",
      kind: "message",
      logId: "traj:D",
      head: "h-fork",
      eventId: "e-w1",
    });

    const results = doi.recallMemory({ query: "widget", limit: 5 }).results;
    // Full page (a naive dedup-after-fetch under a limit-5 SQL page would return
    // 4 here, since the copy sits inside the first five inserted rows).
    expect(results).toHaveLength(5);
    const ids = results.map((r) => r.eventId);
    expect(new Set(ids).size).toBe(5);
    expect(ids.filter((id) => id === "e-w1").length).toBeLessThanOrEqual(1);
  });

  it("dedup prefers the trajectory-log copy over a channel republish", () => {
    gad.sql.exec(
      `INSERT INTO log_heads (log_id, head, log_kind, owner_json, created_at)
       VALUES ('traj:X', 'main', 'trajectory', '{}', '2026-01-01T00:00:00.000Z'),
              ('chan:Y', 'main', 'channel', '{}', '2026-01-01T00:00:00.000Z')`,
    );
    // Insert the channel copy FIRST so the swap branch (adopt the trajectory
    // copy over an already-kept non-trajectory one) is exercised.
    reach(doi).indexMemoryRow({
      text: "shared echo of a published message",
      kind: "message",
      logId: "chan:Y",
      head: "main",
      eventId: "e-shared",
    });
    reach(doi).indexMemoryRow({
      text: "shared echo of a published message",
      kind: "message",
      logId: "traj:X",
      head: "main",
      eventId: "e-shared",
    });

    const results = doi.recallMemory({ query: "shared echo" }).results;
    expect(results).toHaveLength(1);
    expect(results[0]!.logId).toBe("traj:X");
  });

  it("retrieves older evidence even when the current question matches every query term", () => {
    reach(doi).indexMemoryRow({ text: "rollout codename retired why recorded evidence", kind: "message",
      eventId: "current-question", anchor: { kind: "message", messageId: "current-question" } });
    doi.recordHistoryCommitMemory({
      text: "Retired the Harbor Lantern rollout codename because production routing required a distinct name.",
      eventId: "historical-commit", revision: "b".repeat(40), createdAt: "2026-08-14T00:00:00.000Z",
    });
    const results = doi.recallMemory({ query: "rollout codename retired why recorded evidence", limit: 10 }).results;
    expect(results.some((entry) => entry.eventId === "historical-commit")).toBe(true);
    expect(results.some((entry) => entry.eventId === "current-question")).toBe(true);
  });

  it("ranks multi-term recall so a scope hint cannot mask distinctive memory", () => {
    doi.recordHistoryCommitMemory({
      text: "Retire Harbor Lantern after launch; use Retention Service in support records",
      eventId: "event:retire-codename", revision: "a".repeat(40), createdAt: "2026-08-14T00:00:00.000Z",
    });

    const results = doi.recallMemory({
      query: "projects/customer-retention Retire",
      kinds: ["commit"],
    }).results;

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "commit",
      eventId: "event:retire-codename",
      snippet: expect.stringContaining("Retire Harbor Lantern"),
    });
  });
});

describe("GadWorkspaceDO — recall visibility", () => {
  let gad: TestGad;
  let doi: GadWorkspaceDO;

  const OWN_CHANNEL = "channel:own";
  const OTHER_CHANNEL = "channel:sibling";

  /**
   * The host attests the caller's agent binding; the DO never takes it from
   * the request. A test stands in for the host by shadowing the same getter.
   */
  const asAgent = (
    channelId: string | null,
    workspaceRecallCauses?: [string, string, string][],
  ): void => {
    Object.defineProperty(doi, "authorization", {
      configurable: true,
      get: () => ({
        authorizingOrigin: { kind: "code", principal: "code:test" },
        workspaceRecallCauses,
        agentBinding: channelId
          ? {
              entity: null,
              contextId: `context:${channelId}`,
              channelId,
            }
          : null,
      }),
    });
  };

  beforeEach(async () => {
    gad = await createTestDO(GadWorkspaceDO, {
      __objectKey: "gad-recall-visibility",
      WORKSPACE_ID: "workspace-recall",
    });
    doi = gad.instance;
    for (const channelId of [OWN_CHANNEL, OTHER_CHANNEL]) {
      reach(doi).indexMemoryRow({
        text: `the Northstar ingress cuts streams in ${channelId}`,
        kind: "message",
        logId: logIdForChannel(channelId),
        head: headForChannel(channelId),
        eventId: `e-${channelId}`,
        anchor: { messageId: `m-${channelId}`, turnId: null },
      });
    }
    doi.recordHistoryCommitMemory({
      text: "Northstar ingress limits recorded in a commit",
      eventId: "e-commit", revision: "a".repeat(40), createdAt: "2026-08-14T00:00:00.000Z",
    });
  });

  it("withholds a sibling context's conversation from an agent caller", () => {
    asAgent(OWN_CHANNEL);
    const texts = doi
      .recallMemory({ query: "Northstar ingress" })
      .results.map((result) => result.snippet);
    expect(texts.some((text) => text.includes(OWN_CHANNEL))).toBe(true);
    // The leak this closes: a sibling task context's message reached a reader
    // that a provenance walk, query, and search all refuse.
    expect(texts.some((text) => text.includes(OTHER_CHANNEL))).toBe(false);
    // Committed workspace state stays workspace-wide.
    expect(texts.some((text) => text.includes("in a commit"))).toBe(true);
  });

  it("returns no conversation at all to an agent caller with no binding", () => {
    asAgent(null);
    const texts = doi
      .recallMemory({ query: "Northstar ingress" })
      .results.map((result) => result.snippet);
    expect(texts.some((text) => text.includes("channel:"))).toBe(false);
    expect(texts.some((text) => text.includes("in a commit"))).toBe(true);
  });

  it("recalls only the caller's own messages and exact native invocation evidence", () => {
    const originatingInput = {
      nativeSource: {},
      originatingInput: { channelRef: { objectKey: "origin" }, messageId: "request" },
    };
    gad.sql.exec(
      `INSERT INTO log_events
         (log_id, head, seq, envelope_id, payload_kind, actor_json, payload_ref_json, appended_at)
       VALUES ('agent-log', 'branch', 1, 'started', 'invocation.started', '{}', ?, '2026-01-02')`,
      JSON.stringify(originatingInput),
    );
    gad.sql.exec(`
      INSERT INTO trajectory_turns (log_id, head, turn_id)
      VALUES ('agent-log', 'branch', 'turn'), ('agent-log', 'other-branch', 'turn');
      INSERT INTO trajectory_invocations (log_id, head, invocation_id, turn_id, status, started_event_id, updated_at)
      VALUES ('agent-log', 'branch', 'run', 'turn', 'completed', 'started', '2026-01-02'),
             ('agent-log', 'other-branch', 'run', 'turn', 'completed', 'started', '2026-01-02');
      INSERT INTO trajectory_messages (log_id, head, message_id, turn_id, role, status, updated_at)
      VALUES ('agent-log', 'branch', 'answer', 'turn', 'assistant', 'completed', '2026-01-02'),
             ('agent-log', 'other-branch', 'answer', 'turn', 'assistant', 'completed', '2026-01-02'),
             ('origin', 'main', 'request', NULL, 'user', 'completed', '2026-01-02'),
             ('imposter', 'main', 'request', NULL, 'user', 'completed', '2026-01-02');
      DROP TABLE prov_vis_commands;
    `);
    for (const [logId, head, messageId] of [
      ["agent-log", "branch", "answer"],
      ["agent-log", "other-branch", "answer"],
      ["origin", "main", "request"],
      ["imposter", "main", "request"],
    ] as const) {
      reach(doi).indexMemoryRow({
        text: `Northstar ingress evidence in ${logId} / ${head}`,
        kind: "message", logId, head, anchor: { messageId },
      });
    }
    asAgent(OWN_CHANNEL, [["agent-log", "branch", "run"]]);
    const readMessages = () => doi
      .recallMemory({ query: "Northstar ingress", kinds: ["message"] })
      .results.map(({ logId, head }) => [logId, head]);
    expect(readMessages()).toHaveLength(3);
    expect(readMessages()).toEqual(expect.arrayContaining([
      [logIdForChannel(OWN_CHANNEL), headForChannel(OWN_CHANNEL)],
      ["agent-log", "branch"],
      ["origin", "main"],
    ]));
    asAgent(null, []);
    expect(readMessages()).toEqual([]);
  });

  it("leaves an unattributed in-process call unscoped", () => {
    const texts = doi
      .recallMemory({ query: "Northstar ingress" })
      .results.map((result) => result.snippet);
    expect(texts.some((text) => text.includes(OWN_CHANNEL))).toBe(true);
    expect(texts.some((text) => text.includes(OTHER_CHANNEL))).toBe(true);
  });
});
