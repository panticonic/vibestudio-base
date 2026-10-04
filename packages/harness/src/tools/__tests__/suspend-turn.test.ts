import { describe, expect, it, vi } from "vitest";
import {
  createSuspendTurnTool,
  type NativeSuspendTurnExecution,
} from "../suspend-turn.js";
import { nativeToolApi, nativeToolContext } from "../../testing/native-tool.js";

describe("native suspend_turn", () => {
  it("parks and cancels through the same owning native wait contract", async () => {
    const wait = {
      wait: {
        kind: "receipt" as const,
        key: "channel:readiness",
        binding: "channel:bound",
      },
      continuation: { reason: "waiting_for_background" },
    };
    const execute = vi.fn<NativeSuspendTurnExecution["execute"]>(
      async () => wait,
    );
    const cancel = vi.fn<NativeSuspendTurnExecution["cancel"]>(async () => ({
      content: [],
    }));
    const tool = createSuspendTurnTool({ execution: { execute, cancel } });
    const args = { reason: "waiting_for_background" as const };
    const api = nativeToolApi();
    const context = nativeToolContext();
    expect(await tool.execute(args, api, context)).toBe(wait);
    expect(execute).toHaveBeenCalledWith(args, api, context);
    await tool.cancel!(args, api, context);
    expect(cancel).toHaveBeenCalledWith(args, api, context);
  });

  it("preserves a stale-wait result and the original owner failure", async () => {
    const result = {
      content: [
        { type: "text" as const, text: "Integrate the completed run." },
      ],
      details: { completedRunsAwaitingIntegration: ["native:completed"] },
    };
    const api = nativeToolApi();
    const context = nativeToolContext();
    const tool = createSuspendTurnTool({
      execution: {
        execute: async () => result,
        cancel: async () => ({ content: [] }),
      },
    });
    expect(
      await tool.execute({ reason: "waiting_for_background" }, api, context),
    ).toBe(result);
    const error = new Error("Original channel readiness failure");
    const failing = createSuspendTurnTool({
      execution: {
        execute: async () => {
          throw error;
        },
        cancel: async () => ({ content: [] }),
      },
    });
    await expect(failing.execute({}, api, context)).rejects.toBe(error);
  });
});
