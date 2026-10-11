import { describe, expect, it, vi } from "vitest";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { createWorkspacePresentationClient } from "./workspacePresentation.js";

function detail(slotId: string, entityId: string, source: string) {
  return {
    revision: 1,
    slot: {
      slot_id: slotId,
      parent_slot_id: null,
      current_entity_id: entityId,
      current_entity_title: "Agentic Chat",
      current_entry_key: "entry:chat",
      sort_key: 1,
      owner_user_id: "user-1",
      created_at: 1,
      closed_at: null,
    },
    currentHistory: {
      slot_id: slotId,
      cursor: 1,
      entry_key: "entry:chat",
      entity_id: entityId,
      source,
      context_id: "ctx:chat",
      state_args: null,
      options: null,
      recorded_at: 1,
    },
    entity: {
      id: entityId,
      authoritySessionId: "session:chat",
      kind: "panel",
      source: { repoPath: source, effectiveVersion: "version:chat" },
      contextId: "ctx:chat",
      key: "panel:chat",
      createdAt: 1,
      status: "active",
      cleanupComplete: true,
    },
    icon: "./assets/chat.svg",
  };
}

describe("workspace presentation boundary", () => {
  it("uses only the composed workspace-state service for shell reads", async () => {
    const page = {
      revision: 7,
      group: { kind: "roots" as const, ownerUserId: "user-1" },
      nodes: [
        {
          slotId: "panel:tree/browser",
          parentSlotId: null,
          ownerUserId: "user-1",
          createdAt: 1,
          childCount: 0,
          source: "panels/browser",
          title: "Example",
          icon: "🌐",
          kind: "workspace" as const,
          ref: "release",
          placement: { disposition: "side" as const, preferredWidth: 420 },
        },
      ],
      nextCursor: null,
    };
    const call = vi.fn(async (target: string, method: string) => {
      if (target === "main" && method === "workspace-state.panelTree.page") {
        return page;
      }
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });

    const client = createWorkspacePresentationClient(
      schemaRpcClientMock({ call }, "workspace-presentation-test"),
    );
    await expect(
      client.page({
        group: { kind: "roots", ownerUserId: "user-1" },
        limit: 10,
      }),
    ).resolves.toEqual(page);
    expect(call).toHaveBeenCalledOnce();
    expect(call).not.toHaveBeenCalledWith(
      "main",
      "workers.resolveService",
      expect.anything(),
    );
  });

  it("maps composed detail into the existing shell presentation shape", async () => {
    const call = vi.fn(async (target: string, method: string) => {
      if (target === "main" && method === "workspace-state.panelTree.detail") {
        return detail("panel:tree/chat", "panel:nav-chat", "panels/chat");
      }
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });

    const client = createWorkspacePresentationClient(
      schemaRpcClientMock({ call }, "workspace-presentation-test"),
    );
    await expect(client.detail("panel:tree/chat")).resolves.toMatchObject({
      presentation: {
        title: "Agentic Chat",
        icon: "./assets/chat.svg",
      },
    });
  });

  it("routes presentation lifecycle methods through workspace-state without resolving the owner", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const call = vi.fn(
      async (target: string, method: string, args: unknown[]) => {
        if (target !== "main" || !method.startsWith("workspace-state.")) {
          throw new Error(`Unexpected RPC ${target}.${method}`);
        }
        calls.push({ method, args });
        if (method.endsWith("panel.index")) return "panel:nav-chat";
        if (method.endsWith("panel.updateTitle")) return null;
        if (method.endsWith("panel.sourceUsage")) return [];
        return undefined;
      },
    );
    const client = createWorkspacePresentationClient(
      schemaRpcClientMock({ call }, "workspace-presentation-test"),
    );

    await client.indexPanel({ id: "panel:tree/chat", title: "Agentic Chat" });
    await client.updatePanelTitle("panel:tree/chat", "Renamed");
    await client.incrementAccess("panel:tree/chat");
    await client.sourceUsage(25);
    await client.rebuildIndex();

    expect(calls).toEqual([
      {
        method: "workspace-state.panel.index",
        args: [{ id: "panel:tree/chat", title: "Agentic Chat" }],
      },
      {
        method: "workspace-state.panel.updateTitle",
        args: ["panel:tree/chat", "Renamed", undefined],
      },
      {
        method: "workspace-state.panel.incrementAccess",
        args: ["panel:tree/chat"],
      },
      { method: "workspace-state.panel.sourceUsage", args: [25] },
      { method: "workspace-state.panel.rebuildIndex", args: [] },
    ]);
    expect(call).not.toHaveBeenCalledWith(
      "main",
      "workers.resolveService",
      expect.anything(),
    );
  });

  it("omits absent optional RPC arguments rather than serializing them as null", async () => {
    const call = vi.fn(async () => "panel:nav-chat");
    const client = createWorkspacePresentationClient(
      schemaRpcClientMock({ call }, "workspace-presentation-test"),
    );

    await client.updatePanelTitle("panel:tree/chat", "Agentic Chat");

    expect(call).toHaveBeenCalledWith(
      "main",
      "workspace-state.panel.updateTitle",
      ["panel:tree/chat", "Agentic Chat", undefined],
      undefined,
    );
  });
});
