import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ gad: { inspectAgentHealth: vi.fn() } }));
vi.mock("@workspace/runtime", () => runtimeMock);

import { inspectAgentHealth } from "./index.js";

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
