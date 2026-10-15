import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { ConversationStateStore } from "./conversationState.js";
import { conversationQueueStore } from "./queuedDelivery.js";
import {
  DeferredAgentMachine,
  type DeferredQueueStore,
  type PendingDelivery,
} from "@workspace/agentic-core/chat-store";

async function harness() {
  let value: Record<string, unknown> = { channelName: "chat" };
  const patch = vi.fn(async (partial: Record<string, unknown>) => {
    value = { ...value, ...partial };
  });
  const state = new ConversationStateStore(
    { get: () => value, patch, subscribe: () => () => {} },
    "context"
  );
  await state.initialize();
  const blobs = new Map<string, string>();
  const owners = new Map<string, string>();
  const release = vi.fn(async (owner: string) => {
    owners.delete(owner);
  });
  const read = vi.fn(async (digest: string) => blobs.get(digest) ?? null);
  const rpc = schemaRpcClientMock(
    {
      call: async (_target, method, args, options) => {
        options?.signal?.throwIfAborted();
        if (method === "blobstore.putRetained") {
          const input = args[0] as { base64: string; owner: string };
          const bytes = Buffer.from(input.base64, "base64");
          const digest = createHash("sha256").update(bytes).digest("hex");
          if (owners.has(input.owner) && owners.get(input.owner) !== digest)
            throw new Error("Owner already retains different content");
          blobs.set(digest, input.base64);
          owners.set(input.owner, digest);
          return { digest, size: bytes.length };
        }
        if (method === "blobstore.getBase64") return read(String(args[0]));
        if (method === "blobstore.releaseRetention")
          return release((args[0] as { owner: string }).owner);
        throw new Error(`Unexpected ${method}`);
      },
    },
    "code:terminal-chat"
  );
  return {
    state,
    patch,
    owners,
    release,
    read,
    rpc,
    queue: conversationQueueStore(state, state.current, rpc),
  };
}

const delivery: PendingDelivery = {
  kind: "message",
  id: "delivery",
  idempotencyKey: "delivery",
  text: "first",
  attachments: [
    {
      name: "file.txt",
      mimeType: "text/plain",
      data: new Uint8Array([1, 2, 3]),
    },
  ],
};

function machineFor(queueStore: DeferredQueueStore, publishText: (text: string) => Promise<void>) {
  return new DeferredAgentMachine({
    queueStore,
    publishText,
    participants: {},
    pendingAgents: new Map(),
    input: "",
    clearComposer: () => {},
    maybeSetDefaultTitle: () => {},
    coreSendMessage: async () => {},
    availableAgents: [],
    modelCatalog: null,
    firstAgentPending: false,
    resolveOpeningRequest: async () => {},
    channelName: "chat",
    replaySettled: true,
  });
}

describe("canonical queue durable serialization", () => {
  it("retries accepted attachment retirement in place without hydrating or publishing again", async () => {
    const h = await harness();
    await h.queue.put(delivery, new AbortController().signal);
    const failure = new Error("retained release unavailable");
    h.release.mockRejectedValueOnce(failure);
    const publish = vi.fn(async () => {});
    const machine = machineFor(h.queue, publish);
    await machine.ready();
    await vi.waitFor(() =>
      expect(machine.getSnapshot().deferredAgent?.queued[0]).toMatchObject({
        publication: "accepted",
        status: "failed",
        failure: { title: "Message accepted — attachment cleanup pending" },
      })
    );
    expect(h.state.record(h.state.current).queue[0]).toMatchObject({
      publication: "accepted",
      retirement: "releasing",
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(h.read).toHaveBeenCalledTimes(1);
    machine.retryDelivery(delivery.id);
    await vi.waitFor(() => expect(machine.getSnapshot().deferredAgent).toBeUndefined());
    expect(h.state.record(h.state.current).queue).toEqual([]);
    expect(h.owners.size).toBe(0);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(h.read).toHaveBeenCalledTimes(1);
    await machine.close();
  });

  it("restores still-failing cleanup as actionable ownership without hiding independent pending messages", async () => {
    const h = await harness();
    await h.queue.put(delivery, new AbortController().signal);
    const failure = new Error("retention release still unavailable");
    const releaseOwner = h.release.getMockImplementation()!;
    h.release.mockRejectedValue(failure);
    const originalPublish = vi.fn(async () => {});
    const original = machineFor(h.queue, originalPublish);
    await original.ready();
    await vi.waitFor(() =>
      expect(original.getSnapshot().deferredAgent?.queued[0]?.status).toBe("failed")
    );
    await original.close();
    await h.queue.put(
      {
        kind: "message",
        id: "independent",
        idempotencyKey: "independent",
        text: "independent pending",
      },
      new AbortController().signal
    );
    h.read.mockClear();
    const publish = vi.fn(async () => {});
    const restored = machineFor(h.queue, publish);
    await restored.ready();
    await vi.waitFor(() => expect(restored.getSnapshot().deferredAgent?.queued).toHaveLength(1));
    expect(restored.getSnapshot().deferredAgent?.queued[0]).toMatchObject({
      id: delivery.id,
      publication: "accepted",
      retirement: "releasing",
      status: "failed",
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("independent pending", expect.any(Object));
    expect(h.read).not.toHaveBeenCalled();
    h.release.mockImplementation(releaseOwner);
    restored.retryDelivery(delivery.id);
    await vi.waitFor(() => expect(restored.getSnapshot().deferredAgent).toBeUndefined());
    expect(h.owners.size).toBe(0);
    expect(h.state.record(h.state.current).queue).toEqual([]);
    expect(originalPublish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    await restored.close();
  });

  it("restores only metadata and borrows attachment bytes only for the active publication", async () => {
    const h = await harness();
    const signal = new AbortController().signal;
    const admitted = await h.queue.put(delivery, signal);
    expect(admitted?.attachments).toBeUndefined();
    await h.queue.put(
      {
        ...delivery,
        id: "later",
        idempotencyKey: "later",
        attachments: [{ name: "later.txt", mimeType: "text/plain", data: new Uint8Array([9]) }],
      },
      signal
    );
    const loaded = await h.queue.load(signal);
    expect(loaded).toHaveLength(2);
    expect(loaded.every((item) => item.attachments === undefined)).toBe(true);
    expect(h.read).not.toHaveBeenCalled();
    const active = await h.queue.materialize?.(loaded[0]!, signal);
    expect(active?.attachments?.[0]?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(loaded[0]?.attachments).toBeUndefined();
    expect(loaded[1]?.attachments).toBeUndefined();
  });

  it("stores digest references, restores stable delivery identity and retires only its CAS owners", async () => {
    const h = await harness();
    const signal = new AbortController().signal;
    await h.queue.put(delivery, signal);
    const stored = h.state.record(h.state.current).queue[0]!;
    expect(stored.attachments?.[0]).toMatchObject({
      name: "file.txt",
      size: 3,
    });
    expect(JSON.stringify(stored)).not.toContain("AQID");
    const loaded = await h.queue.load(signal);
    expect(loaded[0]).toMatchObject({
      id: delivery.id,
      attachmentSummaries: [{ name: "file.txt", mimeType: "text/plain", size: 3 }],
    });
    expect(loaded[0]?.attachments).toBeUndefined();
    expect(await h.queue.materialize?.(loaded[0]!, signal)).toMatchObject(delivery);
    await h.queue.put({ ...delivery, text: "edited" }, signal);
    expect(h.owners.size).toBe(1);
    expect((await h.queue.load(signal))[0]).toMatchObject({
      id: "delivery",
      idempotencyKey: "delivery",
      text: "edited",
    });
    await h.queue.remove(delivery.id);
    expect(h.owners.size).toBe(0);
    expect(h.state.record(h.state.current).queue).toEqual([]);
  });

  it("preserves the original admission failure and joins release of newly staged content", async () => {
    const h = await harness();
    const failure = new Error("manifest could not be saved");
    h.patch.mockRejectedValueOnce(failure);
    await expect(h.queue.put(delivery, new AbortController().signal)).rejects.toBe(failure);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.owners.size).toBe(0);
    expect(h.state.record(h.state.current).queue).toEqual([]);
  });

  it("retains incomplete admission ownership when promotion and cleanup both fail", async () => {
    const h = await harness();
    await h.state.updateComposer(h.state.current, (draft) => ({
      ...draft,
      text: "not accepted",
    }));
    const write = h.patch.getMockImplementation()!;
    const failure = new Error("pending promotion failed");
    const cleanup = new Error("retention release failed");
    h.patch.mockImplementationOnce(write).mockRejectedValueOnce(failure);
    h.release.mockRejectedValueOnce(cleanup);
    await expect(h.queue.put(delivery, new AbortController().signal)).rejects.toMatchObject({
      errors: [failure, expect.objectContaining({ errors: [cleanup] })],
    });
    expect(h.state.record(h.state.current).queue[0]).toMatchObject({
      retirement: "releasing",
      attachments: [expect.objectContaining({ owner: "terminal-chat:queue:delivery:0" })],
    });
    expect(h.state.record(h.state.current).composer.text).toBe("not accepted");
    expect(h.owners.size).toBe(1);
    expect((await h.queue.load(new AbortController().signal))[0]?.retirement).toBe("releasing");
    expect(h.owners.size).toBe(1);
    await h.queue.remove(delivery.id);
    expect(h.owners.size).toBe(0);
    expect(h.state.record(h.state.current).queue).toEqual([]);
  });

  it("atomically transfers the captured draft into the accepted queue, without clearing later edits", async () => {
    const h = await harness();
    const key = h.state.current;
    await h.state.updateComposer(key, (draft) => ({ ...draft, text: "first" }));
    const submitted = await h.state.captureComposer(key);
    const receipt = { revision: submitted.revision, attachmentIds: [] };
    const queue = conversationQueueStore(h.state, key, h.rpc, () => receipt);
    await queue.put(delivery, new AbortController().signal);
    expect(h.state.record(key)).toMatchObject({
      composer: { text: "" },
      queue: [expect.objectContaining({ retirement: "pending", id: "delivery" })],
    });
    expect((await queue.load(new AbortController().signal))[0]?.idempotencyKey).toBe("delivery");
    await h.state.updateComposer(key, (draft) => ({
      ...draft,
      text: "later edit",
    }));
    await queue.put(
      { ...delivery, id: "second", idempotencyKey: "second" },
      new AbortController().signal
    );
    expect(h.state.record(key).composer.text).toBe("later edit");
  });

  it("does not replay an accepted terminal entry after interrupted retention cleanup", async () => {
    const h = await harness();
    const signal = new AbortController().signal;
    await h.queue.put(delivery, signal);
    const failure = new Error("release failed");
    h.release.mockRejectedValueOnce(failure);
    await expect(h.queue.remove(delivery.id, "accepted")).rejects.toMatchObject({
      errors: [failure],
    });
    expect(h.state.record(h.state.current).queue[0]?.retirement).toBe("releasing");
    expect((await h.queue.load(signal))[0]).toMatchObject({
      publication: "accepted",
      retirement: "releasing",
    });
    await h.queue.remove(delivery.id, "accepted");
    expect(h.owners.size).toBe(0);
  });
});
