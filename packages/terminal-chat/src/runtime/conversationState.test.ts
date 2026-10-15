import { describe, expect, it, vi } from "vitest";
import { ConversationStateStore } from "./conversationState.js";
import type { SessionStateStore } from "./bootstrap.js";

function storage(initial: Record<string, unknown> = {}) {
  let value = initial;
  const patch = vi.fn(async (partial: Record<string, unknown>) => {
    value = { ...value };
    for (const [key, entry] of Object.entries(partial)) {
      if (entry === null) delete value[key];
      else value[key] = entry;
    }
  });
  const port: SessionStateStore = {
    get: () => value,
    patch,
    subscribe: () => () => {},
  };
  return { port, patch };
}

describe("durable conversation state", () => {
  it("migrates legacy host state once and preserves unrelated session state", async () => {
    const legacy = {
      channelName: "chat-old",
      conversationContextId: "fork",
      installedAgents: [{ handle: "ai", key: "one" }],
      agentConfig: { model: "provider:model" },
      forkCursors: { child: 17 },
      unrelated: "keep",
    };
    const source = storage(legacy);
    const state = new ConversationStateStore(source.port, "home");
    await state.initialize();
    const record = state.record(state.current);
    expect(record).toMatchObject({
      contextId: "fork",
      host: {
        channelName: "chat-old",
        installedAgents: legacy.installedAgents,
        agentConfig: legacy.agentConfig,
        forkCursors: legacy.forkCursors,
      },
      composer: { text: "", attachments: [] },
      queue: [],
    });
    expect(source.port.get()["channelName"]).toBeUndefined();
    expect(source.port.get()["unrelated"]).toBe("keep");
    const again = new ConversationStateStore(source.port, "home");
    await again.initialize();
    expect(source.patch).toHaveBeenCalledTimes(1);
    expect(again.current).toBe(state.current);
  });

  it("keeps the current selection and host alive when durable selection fails", async () => {
    const source = storage({ channelName: "original" });
    const state = new ConversationStateStore(source.port, "home");
    await state.initialize();
    const original = state.current;
    const port = state.hostPort(original);
    const listener = vi.fn();
    port.subscribe(listener);
    const failure = new Error("durable write failed");
    source.patch.mockRejectedValueOnce(failure);
    await expect(state.select("other", { channelName: "destination" })).rejects.toBe(failure);
    expect(state.current).toBe(original);
    expect(port.get().channelName).toBe("original");
    expect(listener).not.toHaveBeenCalled();
    await state.select("other", { channelName: "destination" });
    await port.patch({ agentConfig: { model: "old:model" } });
    expect(state.record(state.current).host.channelName).toBe("destination");
    expect(port.get().channelName).toBe("original");
  });

  it("restores each conversation's own draft and settings across selection and restart", async () => {
    const source = storage({
      channelName: "one",
      agentConfig: { model: "one:model" },
    });
    const state = new ConversationStateStore(source.port, "home");
    await state.initialize();
    const first = state.current;
    await state.updateComposer(first, (draft) => ({
      ...draft,
      text: "unfinished first",
    }));
    await state.select("other", {
      channelName: "two",
      agentConfig: { model: "two:model" },
    });
    await state.updateComposer(state.current, (draft) => ({
      ...draft,
      text: "unfinished second",
    }));
    await state.select("home", {
      channelName: "one",
      agentConfig: { model: "wrong:model" },
    });
    expect(state.current).toBe(first);
    expect(state.record(first)).toMatchObject({
      host: { agentConfig: { model: "one:model" } },
      composer: { text: "unfinished first" },
    });
    const restored = new ConversationStateStore(source.port, "home");
    await restored.initialize();
    expect(restored.record(restored.current).composer.text).toBe("unfinished first");
  });
});
