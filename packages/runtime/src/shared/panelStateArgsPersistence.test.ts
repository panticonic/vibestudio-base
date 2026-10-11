import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { describe, expect, it, vi } from "vitest";
import { patchPanelStateArgs } from "./panelStateArgsPersistence.js";

describe("patchPanelStateArgs", () => {
  it("sends the merge patch to the workspace-state owner and returns its result", async () => {
    const call = vi.fn(async (_target: string, method: string, args: unknown[]) => {
      if (method === "workspace-state.slot.patchCurrentStateArgs") {
        return { preserved: true, channelName: "chat-1" };
      }
      throw new Error(`Unexpected RPC ${method} ${JSON.stringify(args)}`);
    });

    await expect(
      patchPanelStateArgs(schemaRpcMock({ call: call }), "panel:tree/chat", {
        channelName: "chat-1",
        stale: null,
      }),
    ).resolves.toEqual({ preserved: true, channelName: "chat-1" });

    // The patch travels unmerged: the owner reads, merges, and validates.
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.patchCurrentStateArgs",
      ["panel:tree/chat", { channelName: "chat-1", stale: null }],
      undefined,
    );
  });
});
