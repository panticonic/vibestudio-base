/**
 * The \`chat\` value rendered UI receives (inline UI, feedback components,
 * the action bar, MDX one-offs): one implementation over the channel client,
 * shared by every chat client. The client supplies only what is its own: how
 * text is sent (its send-and-backfill path) and how a message is focused.
 */
import type { PubSubClient } from "@workspace/pubsub";
import type {
  ChatParticipantMetadata,
  ChatParticipantSummary,
  ChatSandboxValue,
} from "../types.js";
import { unwrapChatMethodResult, type ChatMethodResult } from "../invocation-result.js";
import { sendSandboxText, type normalizeSandboxSendOptions } from "./sandbox-send.js";

export interface ChatSandboxPorts {
  /** The live channel client, read at call time (null while disconnected). */
  client: () => PubSubClient<ChatParticipantMetadata> | null;
  /** The client's own send path, so its transcript shows the message at once. */
  publishText: (
    content: string,
    options: ReturnType<typeof normalizeSandboxSendOptions>
  ) => Promise<void>;
  /** Bring a message into view; false when it is not in the transcript. */
  focusMessage: (messageId: string) => Promise<boolean>;
  contextId: string;
  channelId: string | null;
  rpc: ChatSandboxValue["rpc"];
}

export function createChatSandboxValue(ports: ChatSandboxPorts): ChatSandboxValue {
  const connected = () => {
    const client = ports.client();
    if (!client) throw new Error("Agentic chat is not connected");
    return client;
  };
  const byHandle = (rawHandle: string) => {
    const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
    return (
      Object.values(ports.client()?.roster ?? {}).find(
        (participant) => participant.metadata?.handle === handle
      ) ?? null
    );
  };
  const call = (
    participantId: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ) =>
    waitForMethodHandle(
      connected().callMethod(participantId, method, args, options) as {
        result: Promise<ChatMethodResult>;
        cancel?: () => Promise<void>;
      },
      options
    );
  const callByHandle = (
    rawHandle: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ) => {
    const participant = byHandle(rawHandle);
    if (!participant) throw new Error(`No participant with handle @${rawHandle.replace(/^@/, "")}`);
    return call(participant.id, method, args, options);
  };
  return {
    send: async (content, options) => {
      connected();
      return sendSandboxText(ports.publishText, content, options, crypto.randomUUID());
    },
    publish: async (eventType, payload, options) =>
      connected().publish(eventType, payload, {
        ...options,
        idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID(),
      }),
    publishCustomMessage: async (input, options) =>
      connected().publishCustomMessage(input, {
        idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID(),
      }),
    updateCustomMessage: async (messageId, update, options) =>
      connected().updateCustomMessage(messageId, update, {
        idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID(),
      }),
    registerMessageType: async (input, options) =>
      connected().registerMessageType(
        input,
        options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
      ),
    clearMessageType: async (typeId, options) =>
      connected().clearMessageType(
        typeId,
        options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
      ),
    getMessageType: async (typeId) => connected().getMessageType(typeId),
    getMessageTypes: async () => connected().getMessageTypes(),
    getParticipants: async (): Promise<ChatParticipantSummary[]> =>
      Object.values(ports.client()?.roster ?? {}).map(({ id, ref, metadata }) => ({
        id,
        ref,
        type: metadata.type,
        name: metadata.name,
        isPerson: metadata.type === "user",
        isAgent: metadata.type === "agent",
        ...(metadata.handle ? { handle: metadata.handle } : {}),
        ...(metadata.methods ? { methods: metadata.methods } : {}),
      })),
    replayEnvelope: async (envelopeId) => connected().getEnvelope(envelopeId),
    callMethod: async (participantId, method, args, options) =>
      unwrapChatMethodResult(await call(participantId, method, args, options)),
    callMethodResult: async (participantId, method, args, options) =>
      call(participantId, method, args, options),
    participantByHandle: async (handle) => byHandle(handle),
    callMethodByHandle: async (handle, method, args, options) =>
      unwrapChatMethodResult(await callByHandle(handle, method, args, options)),
    callMethodResultByHandle: async (handle, method, args, options) =>
      callByHandle(handle, method, args, options),
    focusMessage: ports.focusMessage,
    contextId: ports.contextId,
    channelId: ports.channelId,
    rpc: ports.rpc,
  };
}

async function waitForMethodHandle<T>(
  handle: { result: Promise<T>; cancel?: () => Promise<void> },
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortCleanup: (() => void) | undefined;
  const cancel = () => {
    void handle.cancel?.().catch((err) => {
      console.warn("[chat sandbox] Failed to cancel method handle:", err);
    });
  };
  try {
    const blockers: Array<Promise<never>> = [];
    if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
      const timeoutMs = options.timeoutMs;
      blockers.push(
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            cancel();
            reject(new Error(`Method call timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      );
    }
    if (options?.signal) {
      if (options.signal.aborted) {
        cancel();
        throw new Error("Method call aborted");
      }
      blockers.push(
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            cancel();
            reject(new Error("Method call aborted"));
          };
          options.signal!.addEventListener("abort", onAbort, { once: true });
          abortCleanup = () => options.signal!.removeEventListener("abort", onAbort);
        })
      );
    }
    return await Promise.race([handle.result, ...blockers]);
  } finally {
    if (timeout) clearTimeout(timeout);
    abortCleanup?.();
  }
}
