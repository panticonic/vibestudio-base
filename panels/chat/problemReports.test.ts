import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reportSelectedProblem: vi.fn(async () => undefined) }));
vi.mock("@workspace/runtime", () => ({ panel: { slotId: "slot-7" }, rpc: { call: vi.fn() } }));
vi.mock("@workspace/runtime/problem-reports", () => ({
  reportSelectedProblem: mocks.reportSelectedProblem,
}));

import { rpc } from "@workspace/runtime";
import type { ChatProblemReportSelection } from "@workspace/agentic-core/chat-store";
import { createPanelProblemReports } from "./problemReports.js";

beforeEach(() => mocks.reportSelectedProblem.mockClear());

describe("panel problem reports", () => {
  it("scopes the message coordinate to this panel and references the message", async () => {
    const problem: ChatProblemReportSelection["problem"] = {
      category: "quality",
      component: "agent",
      operation: "chat.result",
      code: null,
      kind: "unknown",
      frames: [],
      externalFramesOmitted: 0,
    };
    await createPanelProblemReports().report({
      problem,
      source: "chat",
      coordinate: { channelId: "c1", messageId: "m1" },
      value: { content: "x" },
    });
    const coordinate = JSON.stringify({ panelId: "slot-7", channelId: "c1", messageId: "m1" });
    expect(mocks.reportSelectedProblem).toHaveBeenCalledWith(rpc, {
      problem,
      source: "chat",
      coordinate,
      reference: { kind: "message", coordinate },
      value: { content: "x" },
    });
  });
});
