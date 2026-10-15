import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createConversationClient } from "./conversation.js";

describe("createConversationClient", () => {
  it("uses the workspace channel for history and send", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ seq: 1, text: "hello" }])
      .mockResolvedValueOnce({ messageId: "m1" });
    const client = createConversationClient(
      schemaRpcMock({ call, streamReadable: vi.fn() }),
    );

    await expect(client.history("chat")).resolves.toEqual([
      { seq: 1, text: "hello" },
    ]);
    await expect(client.send("chat", "hello")).resolves.toEqual({
      messageId: "m1",
    });
    expect(call).toHaveBeenNthCalledWith(
      1,
      "chat",
      "getReplayAfter",
      [{ after: 0 }],
      undefined,
    );
    expect(call).toHaveBeenNthCalledWith(
      2,
      "chat",
      "sendAsCaller",
      ["hello", {}],
      undefined,
    );
  });

  it("reassembles split subscription records and cancels after callback failure", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"kind":"message","payload":'),
        );
        controller.enqueue(new TextEncoder().encode('{"text":"a"}}\n'));
      },
      cancel: cancelled,
    });
    const streamReadable = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: [],
        finalUrl: "",
        body,
      });
    const call = vi.fn();
    const client = createConversationClient(
      schemaRpcMock({ call, streamReadable }),
    );
    const records: unknown[] = [];
    await expect(
      client.subscribe("chat", "website-participant", {}, (record) => {
        records.push(record);
        throw new Error("consumer stopped");
      }),
    ).rejects.toThrow("consumer stopped");
    expect(records).toEqual([{ kind: "message", payload: { text: "a" } }]);
    expect(cancelled).toHaveBeenCalled();
  });
});
