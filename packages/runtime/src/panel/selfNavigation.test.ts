import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createPanelSelfNavigation } from "./selfNavigation.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

describe("panel self navigation", () => {
  it("reopens in the current workspace branch without emitting a context override", async () => {
    const call = vi.fn(async (_target: string, method: string) =>
      method === "workers.resolveService"
        ? durableObjectServiceFixture("do:workspace-state")
        : {
            revision: 1,
            slot: {
              slot_id: "panel:tree/slot-1",
              parent_slot_id: null,
              current_entity_id: "panel:nav-slot-1-current",
              current_entry_key: "entry-1",
              sort_key: 0,
              created_at: 1,
              closed_at: null,
            },
            currentHistory: {
              slot_id: "panel:tree/slot-1",
              cursor: 0,
              entry_key: "entry-1",
              entity_id: "panel:nav-slot-1-current",
              source: "panels/chat",
              context_id: "ctx-chat",
              state_args: "{}",
              recorded_at: 1,
            },
            entity: {
              id: "panel:nav-slot-1-current",
              authoritySessionId: "authority-chat",
              kind: "panel",
              source: { repoPath: "panels/chat", effectiveVersion: "test" },
              contextId: "ctx-chat",
              key: "chat",
              createdAt: 1,
              status: "active",
              cleanupComplete: false,
            },
          }
    );
    const navigatePanel = vi.fn(async () => ({ panelId: "slot-1", title: "Chat" }));
    const navigation = createPanelSelfNavigation({
      rpc: schemaRpcMock({ call }),
      slotId: "slot-1",
      navigatePanel,
    });

    await expect(navigation.reopen({ stateArgs: { channelName: "chat-1" } })).resolves.toEqual({
      id: "slot-1",
      title: "Chat",
    });
    expect(navigatePanel).toHaveBeenLastCalledWith(
      "slot-1",
      "panels/chat",
      { stateArgs: { channelName: "chat-1" } }
    );
  });

  it("switches context only through the panel navigation option", async () => {
    const call = vi.fn(async () => ({ id: "slot-1", title: "Chat" }));
    const navigatePanel = vi.fn(async () => ({ panelId: "slot-1", title: "Chat" }));
    const navigation = createPanelSelfNavigation({
      rpc: schemaRpcMock({ call }),
      slotId: "slot-1",
      navigatePanel,
    });

    await navigation.switchContext(" ctx-fork ", {
      source: "panels/chat",
      ref: "ctx:ctx-fork",
      stateArgs: { channelName: "fork-1" },
    });

    expect(navigatePanel).toHaveBeenCalledWith(
      "slot-1",
      "panels/chat",
      {
        contextId: "ctx-fork",
        ref: "ctx:ctx-fork",
        source: "panels/chat",
        stateArgs: { channelName: "fork-1" },
      }
    );
  });

  it("rejects an empty context before dispatch", () => {
    const call = vi.fn();
    const navigation = createPanelSelfNavigation({ rpc: schemaRpcMock({ call }), slotId: "slot-1" });

    expect(() => navigation.switchContext("  ")).toThrow(/must be non-empty/);
    expect(call).not.toHaveBeenCalled();
  });
});
