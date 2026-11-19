import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  gad: {
    inspectAgentHealth: vi.fn(),
    inspectTurnState: vi.fn(),
    inspectPublicationIntegrity: vi.fn(),
    inspectChannelRoster: vi.fn(),
    inspectChannelEnvelopes: vi.fn(),
  },
}));
vi.mock("@workspace/runtime", () => runtimeMock);

import { inspectAgentHealth } from "./index.js";
import { bindChannelReview } from "./workflow.js";
import { logIdForChannel } from "@vibestudio/trajectory-identity";

describe("inspectAgentHealth", () => {
  beforeEach(() => {
    runtimeMock.gad.inspectAgentHealth.mockResolvedValue({
      channelId: "chan_1",
      branchId: "main",
      generatedAt: "2026-10-30T15:42:10.000Z",
      summary: { durableIntegrityOk: true, activity: "idle", activeParticipants: 2 },
      publicationIntegrity: { summary: {}, rows: [] },
      turnState: { summary: { openTurns: 0, streamingMessages: 0, duplicateOpenedTurns: 0 }, rows: [] },
      invocationState: { rows: [] },
      roster: { summary: { activeParticipants: 2 } },
      storage: { rows: [] },
    });
  });

  it("takes one snapshot of the named channel and branch and reports it", async () => {
    const report = await inspectAgentHealth({ channelId: "chan_1", branchId: "main" });
    expect(runtimeMock.gad.inspectAgentHealth).toHaveBeenCalledTimes(1);
    expect(runtimeMock.gad.inspectAgentHealth).toHaveBeenCalledWith({ channelId: "chan_1", branchId: "main" });
    expect(report).toMatchObject({ channelId: "chan_1", status: "healthy", findings: [] });
  });

  it("leaves the branch to the service when none is named", async () => {
    await inspectAgentHealth({ channelId: "chan_1" });
    expect(runtimeMock.gad.inspectAgentHealth).toHaveBeenCalledWith({ channelId: "chan_1" });
  });
});

describe("caller-bound GAD review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.gad.inspectAgentHealth.mockResolvedValue({
      channelId: "owned",
      branchId: "observed-branch",
      generatedAt: "2026-11-19T11:00:00.000Z",
      summary: {
        durableIntegrityOk: false,
        activity: "in-flight",
        activeParticipants: 1,
      },
      publicationIntegrity: { summary: { missingMappings: 1 }, rows: [] },
      turnState: {
        summary: {
          openTurns: 0,
          streamingMessages: 0,
          duplicateOpenedTurns: 1,
        },
        rows: [],
      },
      invocationState: { rows: [] },
      roster: { summary: { activeParticipants: 1 } },
      storage: { rows: [] },
    });
    runtimeMock.gad.inspectTurnState.mockResolvedValue({
      summary: { duplicateOpenedTurns: 1, openTurns: 0 },
      rows: [],
    });
  });

  it("follows one exact finding against the observed channel's trajectory and branch", async () => {
    const { request, services } = bindChannelReview({
      channelId: "owned",
      goal: "Check blocked channel appends",
      view: "triage",
    });
    await expect(
      services.gadFollowUp.inspect("before-read", "duplicate-turn-opened"),
    ).rejects.toThrow(/health receipt/);
    const evidence = await services.gadHealth.observe(request.operationId);
    expect(evidence).toMatchObject({
      channelId: "owned",
      branchId: "observed-branch",
      integrity: "broken",
      activity: "in-flight",
    });
    expect(evidence.findings.map((finding) => finding.kind)).toEqual([
      "missing-publication-mapping",
      "duplicate-turn-opened",
    ]);
    await expect(
      services.gadFollowUp.inspect(evidence.receipt, "oversized-storage"),
    ).rejects.toThrow(/observed finding/);
    await expect(
      services.gadFollowUp.inspect(evidence.receipt, "duplicate-turn-opened"),
    ).resolves.toMatchObject({
      inspector: "inspectTurnState",
      counters: [
        { name: "duplicateOpenedTurns", count: 1 },
        { name: "openTurns", count: 0 },
      ],
    });
    expect(runtimeMock.gad.inspectTurnState).toHaveBeenCalledExactlyOnceWith({
      trajectoryId: logIdForChannel("owned"),
      branchId: "observed-branch",
      limit: 12,
    });
    await expect(
      services.gadFollowUp.inspect(
        evidence.receipt,
        "missing-publication-mapping",
      ),
    ).rejects.toThrow(/health receipt/);
    expect(runtimeMock.gad.inspectPublicationIntegrity).not.toHaveBeenCalled();
  });

  it("keeps the bounded channel tail out of a historical branch recap", async () => {
    const historical = bindChannelReview({
      channelId: "owned",
      branchId: "earlier",
      goal: "Read the earlier branch",
      view: "recap",
    });
    await expect(
      historical.services.gadConversation.read(historical.request.operationId),
    ).resolves.toMatchObject({
      status: "branch-not-supported",
      latest: null,
    });
    expect(runtimeMock.gad.inspectChannelEnvelopes).not.toHaveBeenCalled();
    runtimeMock.gad.inspectChannelEnvelopes.mockResolvedValue({
      items: [
        {
          envelopeId: "exact",
          seq: 17,
          from: { kind: "external", id: "test" },
          payloadKind: "agentic.trajectory.v1/event",
          payloadSummary: {
            kind: "message.completed",
            payload: {
              role: "user",
              blocks: [{ type: "text", content: "Any update?" }],
            },
          },
          publishedAt: "2026-11-19T11:00:00.000Z",
        },
      ],
    });
    const recap = bindChannelReview({
      channelId: "owned",
      goal: "Read the latest user message",
      view: "recap",
    });
    await expect(
      recap.services.gadConversation.read(recap.request.operationId),
    ).resolves.toMatchObject({
      status: "observed",
      latest: { seq: 17, speaker: "user", text: "Any update?" },
      standing: "awaiting-agent",
    });
    expect(
      runtimeMock.gad.inspectChannelEnvelopes,
    ).toHaveBeenCalledExactlyOnceWith({
      channelId: "owned",
      window: { kind: "tail" },
      limit: 40,
    });
    expect(runtimeMock.gad.inspectAgentHealth).not.toHaveBeenCalled();
  });
});
