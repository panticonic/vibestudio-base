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
function withHandle(entry: RosterEntry, handle: string): RosterEntry {
  return { ...entry, handle };
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
  it("names offers colliding with a local tool readably and deterministically", () => {
    const execution = engine();
    const peers = [
      withHandle(peer("user:one", "eval"), "alice"),
      withHandle(peer("user:two", "eval"), "bob"),
      peer("user:three", "eval"),
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
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "eval_alice",
      "eval_bob",
      "eval_user_three",
    ]);
    for (const tool of tools)
      expect(
        (tool.executionData as { targetIds: string[] }).targetIds,
      ).toHaveLength(1);
  });
  it("merges identical offers into one plain-named tool with a required target selector", async () => {
    const execution = engine();
    const [tool, ...rest] = createNativeChannelMethodTools(
      "chat",
      "agent",
      [
        withHandle(peer("user:one"), "desktop"),
        withHandle(peer("user:two"), "mobile"),
      ],
      new Set(),
      execution as never,
    );
    expect(rest).toHaveLength(0);
    expect(tool!.name).toBe("inline_ui");
    expect(tool!.parameters).toMatchObject({
      required: ["path", "target_participant"],
      properties: {
        path: { type: "string" },
        target_participant: { type: "string", enum: ["desktop", "mobile"] },
      },
    });
    expect(tool!.description).toContain("desktop");
    expect(tool!.description).toContain("mobile");
    await tool!.execute(
      { path: "a.tsx", target_participant: "mobile" },
      { executionData: tool!.executionData } as ToolExecutionApi,
      BACKGROUND_CONTEXT,
    );
    await expect(
      execution.execute.mock.results[0]!.value,
    ).resolves.toMatchObject({
      details: { targetIds: ["user:two"], args: { path: "a.tsx" } },
    });
    await expect(
      tool!.execute(
        { path: "a.tsx", target_participant: "nobody" },
        { executionData: tool!.executionData } as ToolExecutionApi,
        BACKGROUND_CONTEXT,
      ),
    ).rejects.toThrow("target_participant must be one of");
  });
  it("targets participant ids when handles are missing", () => {
    const [tool] = createNativeChannelMethodTools(
      "chat",
      "agent",
      [peer("user:one"), peer("user:two")],
      new Set(),
      engine() as never,
    );
    expect(tool!.parameters).toMatchObject({
      properties: {
        target_participant: { enum: ["user:one", "user:two"] },
      },
    });
  });
  it("exposes genuinely different same-named offers as separate handle-named tools", () => {
    const different = withHandle(peer("user:two"), "mobile");
    (different.methods[0] as { parameters: unknown }).parameters = {
      type: "object",
      properties: { url: { type: "string" } },
    };
    const tools = createNativeChannelMethodTools(
      "chat",
      "agent",
      [withHandle(peer("user:one"), "desktop"), different],
      new Set(),
      engine() as never,
    );
    expect(tools.map((tool) => tool.name)).toEqual([
      "inline_ui_desktop",
      "inline_ui_mobile",
    ]);
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
