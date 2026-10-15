import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { createHash } from "node:crypto";
import type { DeferredQueueStore, PendingDelivery } from "@workspace/agentic-core/chat-store";
import type { ChatRpc } from "./bootstrap.js";
import {
  ConversationStateStore,
  type ComposerReceipt,
  type PendingFile,
  type StoredDelivery,
} from "./conversationState.js";

/** Durable serialization of the machine's queue. Bytes live only in the existing retained CAS. */
export function conversationQueueStore(
  state: ConversationStateStore,
  key: string,
  rpc: ChatRpc,
  captureComposer?: () => ComposerReceipt | undefined
): DeferredQueueStore {
  const release = async (owners: readonly string[]): Promise<void> => {
    const results = await Promise.allSettled(
      owners.map((owner) =>
        rpc.call("main", mainRpcMethods["blobstore.releaseRetention"], [{ owner }])
      )
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (errors.length) throw new AggregateError(errors, "Queued attachment cleanup failed");
  };
  const remove = async (id: string, outcome?: "accepted"): Promise<void> => {
    const item = state.record(key).queue.find((item) => item.id === id);
    if (!item) return;
    await state.updateQueue(key, (queue) =>
      queue.map((item) =>
        item.id === id
          ? {
              ...item,
              retirement: "releasing",
              ...(outcome === "accepted" ? { publication: "accepted" as const } : {}),
            }
          : item
      )
    );
    await release((item.attachments ?? []).map((file) => file.owner));
    await state.updateQueue(key, (queue) => queue.filter((item) => item.id !== id));
  };
  const cold = (stored: StoredDelivery): PendingDelivery => {
    const { retirement: _retirement, attachments, ...item } = stored;
    return {
      ...item,
      ...(stored.retirement === "pending" ? {} : { retirement: stored.retirement }),
      ...(attachments?.length
        ? {
            attachmentSummaries: attachments.map(({ name, mimeType, size }) => ({
              name,
              mimeType,
              size,
            })),
          }
        : {}),
    };
  };
  return {
    async load(signal) {
      // Restore cleanup ownership as actionable rows too. A failing release
      // must not prevent the machine from restoring the rest of its queue.
      signal.throwIfAborted();
      return state.record(key).queue.map(cold);
    },
    async materialize(item, signal) {
      const stored = state.record(key).queue.find((entry) => entry.id === item.id);
      if (!stored || stored.retirement !== "pending" || stored.publication === "accepted")
        throw new Error("This delivery is not admitted for publication.");
      const hydrated = [];
      for (const file of stored.attachments ?? []) {
        const bytes = await rpc.call("main", mainRpcMethods["blobstore.getBase64"], [file.digest], {
          signal,
        });
        if (bytes === null)
          throw new Error(`Queued attachment ${file.name} is missing from retained storage.`);
        hydrated.push({
          name: file.name,
          mimeType: file.mimeType,
          data: new Uint8Array(Buffer.from(bytes, "base64")),
        });
      }
      signal.throwIfAborted();
      return {
        ...item,
        ...(stored.attachments?.length ? { attachments: hydrated } : {}),
      };
    },
    async put(item, signal) {
      const receipt = captureComposer?.();
      const previous = state.record(key).queue.find((entry) => entry.id === item.id);
      const files: PendingFile[] = item.attachments
        ? item.attachments.map((input, index) => ({
            id: `${item.id}:${index}`,
            owner: `terminal-chat:queue:${item.id}:${index}`,
            digest: createHash("sha256").update(input.data).digest("hex"),
            size: input.data.byteLength,
            name: input.name ?? "attachment",
            mimeType: input.mimeType,
            status: "pending",
          }))
        : (previous?.attachments ?? []);
      const { attachments: _attachments, attachmentSummaries: _summaries, ...delivery } = item;
      const stored: StoredDelivery = {
        ...delivery,
        retirement: "pending",
        ...(files.length ? { attachments: files } : {}),
      };
      if (previous) {
        // Editing is metadata-only. The admitted attachment identities and CAS
        // owners remain unchanged; an edit never allocates replacement bytes.
        if (JSON.stringify(previous.attachments ?? []) !== JSON.stringify(files))
          throw new Error("Queued attachment content cannot change during a metadata edit.");
        await state.updateQueue(key, (queue) =>
          queue.map((entry) => (entry.id === item.id ? stored : entry))
        );
        return cold(stored);
      }
      // Admit cleanup ownership before allocating any retained content. A crash
      // at every following await leaves a durable, non-publishable staging intent.
      await state.updateQueue(key, (queue) => [...queue, { ...stored, retirement: "staging" }]);
      try {
        for (const [index, input] of (item.attachments ?? []).entries()) {
          const file = files[index]!;
          const content = await rpc.call(
            "main",
            mainRpcMethods["blobstore.putRetained"],
            [
              {
                owner: file.owner,
                base64: Buffer.from(input.data).toString("base64"),
              },
            ],
            { signal }
          );
          if (content.digest !== file.digest || content.size !== file.size)
            throw new Error("Retained attachment identity did not match its content.");
        }
        signal.throwIfAborted();
        await state.admitDelivery(key, stored, receipt);
        return cold(stored);
      } catch (error) {
        try {
          await remove(item.id);
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Queue admission and attachment cleanup failed",
            { cause: error }
          );
        }
        throw error;
      }
    },
    remove,
  };
}
