import { describe, expect, it, vi } from "vitest";

import { AgentWorkerBase, hasAskableUser } from "./agent-worker-base.js";

describe("agent loop tool availability", () => {
  it("offers ask_user only when the channel has a canonical user participant", () => {
    expect(
      hasAskableUser([
        { ref: { kind: "headless" } },
        { ref: { kind: "agent" } },
      ]),
    ).toBe(false);
    expect(
      hasAskableUser([
        { ref: { kind: "headless" } },
        { ref: { kind: "user" } },
      ]),
    ).toBe(true);
  });
});

describe("conversation address discovery", () => {
  function tools() {
    const local = {
      channelId: "current",
      roster: [
        {
          id: "participant-one",
          kind: "agent",
          metadata: { handle: "helper" },
          displayName: "Helper",
        },
      ],
      parent: { participantId: "supervisor-one" },
      runs: [
        {
          runId: "child-one",
          taskChannelId: "child-channel",
          status: "running",
        },
      ],
    };
    const conversation = vi.fn(() => local);
    const global = vi.fn(async () => ({
      ...local,
      directory: [{ instanceId: "unrelated", channelId: "foreign" }],
    }));
    const search = vi.fn(async () => ({
      summary: { rows: 1 },
      entries: [
        {
          ref: "agent:archivist@foreign",
          status: "running",
          handle: "archivist",
        },
      ],
    }));
    const vessel = Object.assign(Object.create(AgentWorkerBase.prototype), {
      conversationAddresseeContext: conversation,
      addresseeContext: global,
      callGad: search,
    }) as {
      createDiscoveryTools(channelId: string): Array<{
        name: string;
        parameters: unknown;
        execute(
          id: string,
          args: Record<string, unknown>,
        ): Promise<{ details: Record<string, unknown> }>;
      }>;
    };
    return {
      tools: vessel.createDiscoveryTools("current"),
      conversation,
      global,
      search,
    };
  }

  it("enumerates the bound conversation and owned relationships without consulting the workspace directory", async () => {
    const f = tools();
    const tool = f.tools.find((x) => x.name === "list_addressees")!;
    const result = await tool.execute("list", {});
    expect(result.details["addressees"]).toEqual([
      {
        ref: "(omit `to`)",
        kind: "channel",
        note: "everyone in this conversation",
      },
      { ref: "@helper", kind: "agent", note: "Helper" },
      { ref: "parent", kind: "supervisor", note: "the agent that spawned you" },
      {
        ref: "run:child-one",
        kind: "subagent run",
        note: "running · child-channel",
      },
    ]);
    expect(f.global).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
    expect(tool.parameters).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  it("uses an explicit purpose search to discover an agent elsewhere", async () => {
    const f = tools();
    const tool = f.tools.find((x) => x.name === "discover_agents")!;
    const result = await tool.execute("search", { query: "archivist" });
    expect(f.search).toHaveBeenCalledWith("searchAgentDirectory", {
      query: "archivist",
    });
    expect(result.details["entries"]).toEqual([
      {
        ref: "agent:archivist@foreign",
        status: "running",
        handle: "archivist",
      },
    ]);
    expect(f.conversation).not.toHaveBeenCalled();
  });
});
