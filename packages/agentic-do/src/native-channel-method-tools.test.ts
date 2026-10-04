import { describe, expect, it, vi } from "vitest";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { ToolExecutionApi } from "@panticonic/pi-durable";
import type { RosterEntry } from "@workspace/agentic-core/agent-channel-roster";
import { createNativeChannelMethodTools } from "./native-channel-method-tools.js";

function peer(id: string, name = "inline_ui"): RosterEntry {
  return {
    participantId: id,
    ref: { kind: "user", id: id as never },
    methods: [
      {
        name,
        description: "Render the actual component",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  };
}
function engine() {
  return {
    execute: vi.fn(async (prepare: () => Promise<unknown>) => ({
      content: [],
      details: await prepare(),
    })),
    cancel: vi.fn(async () => ({ content: [] })),
  };
}
describe("native advertised channel tools", () => {
  it("offers the real interactive schema and binds execution to the offered human", async () => {
    const execution = engine();
    const [tool] = createNativeChannelMethodTools(
      "chat",
      "agent",
      [peer("user:one")],
      new Set(),
      execution as never,
    );
    expect(tool!.name).toBe("inline_ui");
    expect(tool!.parameters).toMatchObject({
      required: ["path"],
      properties: { path: { type: "string" } },
    });
    await tool!.execute(
      { path: "skills/onboarding/SetupHub.tsx" },
      { executionData: tool!.executionData } as ToolExecutionApi,
      BACKGROUND_CONTEXT,
    );
    await expect(
      execution.execute.mock.results[0]!.value,
    ).resolves.toMatchObject({
      details: {
        channelId: "chat",
        callerId: "agent",
        targetIds: ["user:one"],
        method: "inline_ui",
        args: { path: "skills/onboarding/SetupHub.tsx" },
      },
    });
  });
  it("retains an old offer's exact address when the executable registry is refreshed", async () => {
    const execution = engine();
    const [old] = createNativeChannelMethodTools(
      "chat",
      "agent",
      [peer("user:old")],
      new Set(),
      execution as never,
    );
    const [current] = createNativeChannelMethodTools(
      "other-chat",
      "other-agent",
      [peer("user:new")],
      new Set(),
      execution as never,
    );
    const result = await current!.execute(
      { path: "original.tsx" },
      { executionData: old!.executionData } as ToolExecutionApi,
      BACKGROUND_CONTEXT,
    );
    expect(result).toMatchObject({
      details: {
        channelId: "chat",
        callerId: "agent",
        targetIds: ["user:old"],
      },
    });
  });
  it("names colliding offers deterministically without replacing a local tool or broadcasting", () => {
    const execution = engine();
    const peers = [
      peer("user:one"),
      peer("user:two"),
      peer("user:one", "eval"),
    ];
    const make = (roster: RosterEntry[]) =>
      createNativeChannelMethodTools(
        "chat",
        "agent",
        roster,
        new Set(["eval"]),
        execution as never,
      );
    const tools = make(peers);
    expect(tools.map((tool) => tool.name)).toEqual(
      make([...peers].reverse()).map((tool) => tool.name),
    );
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(3);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^cm_[a-f0-9]{60}$/);
      expect(tool.executionData).toMatchObject({
        targetIds: expect.arrayContaining([expect.stringMatching(/^user:/)]),
      });
      expect(
        (tool.executionData as { targetIds: string[] }).targetIds,
      ).toHaveLength(1);
    }
  });
  it("uses the same native cancellation owner and refuses a lost execution binding", async () => {
    const execution = engine();
    const [tool] = createNativeChannelMethodTools(
      "chat",
      "agent",
      [peer("user:one")],
      new Set(),
      execution as never,
    );
    const api = { executionData: tool!.executionData } as ToolExecutionApi;
    await tool!.cancel!({}, api, BACKGROUND_CONTEXT);
    expect(execution.cancel).toHaveBeenCalledWith(api, BACKGROUND_CONTEXT);
    await expect(
      tool!.execute(
        {},
        { executionData: null } as ToolExecutionApi,
        BACKGROUND_CONTEXT,
      ),
    ).rejects.toThrow("Channel method tool lost its original offered owner");
  });
});
