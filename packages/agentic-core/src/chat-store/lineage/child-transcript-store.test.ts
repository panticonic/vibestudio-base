import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { ChildTranscriptStore } from "./child-transcript-store.js";

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("condition not reached");
}

describe("ChildTranscriptStore", () => {
  it("ends loading on a failed observer and offers a user-facing failure with details", async () => {
    const failure = Object.assign(new Error("channel service unavailable"), {
      errorKind: "application",
    });
    const call = vi.fn(async () => {
      throw failure;
    });
    const store = new ChildTranscriptStore({
      connection: {
        config: {
          clientId: "panel:parent",
          rpc: {
            ...schemaRpcMock({ call }),
            selfId: "panel:parent",
            on: () => () => undefined,
          } as never,
        },
        metadata: { name: "Parent", type: "panel" },
      },
      channelId: "task-channel",
      contextId: "task-context",
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const release = store.retain();
    try {
      await until(() => store.getSnapshot().failure !== null);
      const snapshot = store.getSnapshot();
      expect(snapshot.loading).toBe(false);
      expect(snapshot.failure).toMatchObject({
        title: "Couldn't load this subagent's transcript",
        detail: "channel service unavailable",
      });
      expect(snapshot.error).toContain("Retry");

      call.mockClear();
      store.retry();
      expect(store.getSnapshot().failure).toBeNull();
      expect(store.getSnapshot().loading).toBe(true);
      await until(() => store.getSnapshot().failure !== null);
      expect(call).toHaveBeenCalled();
    } finally {
      release();
      errors.mockRestore();
    }
  });
});
