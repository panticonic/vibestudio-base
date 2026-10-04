import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { successfulTestRpcFetch } from "@vibestudio/durable/test-utils";
import { PubSubChannel } from "@workspace-workers/pubsub-channel";
import { GadWorkspaceDO } from "@workspace-workers/workspace-source";

export interface NativeChannelProviderAdmission {
  invocationId: string;
  turnId?: string;
  providerClaimGeneration: number;
}

/** Exercise the real channel pending-call, provider claim and execution fence.
 * Only external host operations and the delivered provider are supplied by the
 * test; channel and workspace-source state are the production implementations. */
export async function createNativeChannelProvider(options: {
  channelId: string;
  participantId: string;
  cancel?: (channelId: string, callId: string) => Promise<void>;
  deliver: (
    channelId: string,
    callId: string,
    method: string,
    args: unknown,
    admission: NativeChannelProviderAdmission,
  ) => Promise<{ result: unknown; isError?: boolean }>;
}) {
  const gad = await createTestDO(GadWorkspaceDO, {
    __objectKey: "workspace",
    RPC_FETCH: successfulTestRpcFetch,
  });
  const channel = await createTestDO(PubSubChannel, {
    __objectKey: options.channelId,
  });
  const channelId = `do:workers/pubsub-channel:PubSubChannel:${options.channelId}`;
  const gadId = "do:workers/workspace-source:GadWorkspaceDO:workspace";
  const provider = {
    callerId: options.participantId,
    callerKind: "do" as const,
  };
  const work = new Set<Promise<unknown>>();
  const context = (
    channel.instance as unknown as {
      ctx: { waitUntil(promise: Promise<unknown>): void };
    }
  ).ctx;
  context.waitUntil = (promise) => {
    work.add(promise);
    // Keep failures observable to join(), without unhandled rejections.
    void promise.catch(() => undefined);
  };
  const outcomes = new Map<
    string,
    {
      resolve(value: { result: unknown; isError?: boolean }): void;
      reject(reason: unknown): void;
    }
  >();
  const blobs = new Map<string, string>();
  void (channel.instance as unknown as { rpc: unknown }).rpc;
  const client = (
    channel.instance as unknown as {
      _connectionless: { client: Record<string, unknown> };
    }
  )._connectionless.client;
  Object.assign(client, {
    emit: async () => undefined,
    call: async (target: string, method: string, args: unknown[]) => {
      if (target === gadId)
        return gad.callAs(
          { callerId: channelId, callerKind: "do" },
          method,
          ...args,
        );
      if (
        target === options.participantId &&
        method === "cancelDirectMethodCall" &&
        options.cancel
      )
        return options.cancel(String(args[0]), String(args[1]));
      if (target === options.participantId && method === "onMethodCall") {
        const callId = String(args[1]);
        try {
          const result = await options.deliver(
            String(args[0]),
            callId,
            String(args[2]),
            args[3],
            args[4] as NativeChannelProviderAdmission,
          );
          outcomes.get(callId)?.resolve(result);
          return result;
        } catch (error) {
          outcomes.get(callId)?.reject(error);
          throw error;
        }
      }
      if (target === "main" && method === "workers.resolveService")
        return {
          kind: "durable-object",
          source: "vibestudio/internal",
          className: "GadWorkspaceDO",
          objectKey: "workspace",
          targetId: gadId,
        };
      if (
        target === "main" &&
        method === "workspace-state.entity.resolveActive"
      )
        return { id: args[0], kind: "do" };
      if (
        target === "main" &&
        [
          "runtime.setTitle",
          "workspace-state.alarmSet",
          "workspace-state.alarmClear",
        ].includes(method)
      )
        return undefined;
      if (target === "main" && method === "blobstore.putText") {
        const value = String(args[0]);
        const digest = `provider-fixture-blob-${blobs.size + 1}`;
        blobs.set(digest, value);
        return { digest, size: value.length };
      }
      if (target === "main" && method === "blobstore.getText")
        return blobs.get(String(args[0])) ?? null;
      throw new Error(`Unexpected provider fixture RPC ${target}.${method}`);
    },
  });
  async function join(): Promise<void> {
    // Each exact waitUntil promise owns the complete provider delivery including
    // canonical settlement. New work can only be appended by the joined work.
    while (work.size) {
      const pending = [...work];
      const results = await Promise.allSettled(pending);
      for (const promise of pending) work.delete(promise);
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
  }
  try {
    await channel.callAs(provider, "join", {
      participantId: options.participantId,
      revision: 1,
      contextId: "ctx-1",
      metadata: { name: "Native method provider", type: "agent" },
      delivery: "all",
      endpoint: {
        kind: "entity",
        entityId: options.participantId,
        invocation: "direct",
      },
      applicationConfig: null,
      replay: false,
    });
  } catch (error) {
    await join();
    channel.db.close();
    gad.db.close();
    throw error;
  }
  return {
    channel,
    markExecutionStarted: (
      participantId: string,
      callId: string,
      generation: number,
    ) =>
      channel.callAs<{ accepted: boolean }>(
        provider,
        "markMethodCallExecutionStarted",
        participantId,
        callId,
        generation,
      ),
    async invoke(callId: string, method: string, args: unknown) {
      let resolve!: (value: { result: unknown; isError?: boolean }) => void;
      let reject!: (reason: unknown) => void;
      const outcome = new Promise<{ result: unknown; isError?: boolean }>(
        (yes, no) => {
          resolve = yes;
          reject = no;
        },
      );
      void outcome.catch(() => undefined);
      if (outcomes.has(callId))
        throw new Error(`Provider fixture already owns ${callId}`);
      outcomes.set(callId, { resolve, reject });
      try {
        const callerId = "do:workers/test:MethodCaller:caller";
        await channel.callAs(
          { callerId, callerKind: "do" },
          "callMethod",
          callerId,
          options.participantId,
          callId,
          method,
          args,
        );
        await join();
        return await outcome;
      } finally {
        outcomes.delete(callId);
      }
    },
    async cancel(callId: string) {
      const callerId = "do:workers/test:MethodCaller:caller";
      await channel.callAs(
        { callerId, callerKind: "do" },
        "cancelMethodCall",
        callerId,
        callId,
      );
      await join();
    },
    async close() {
      try {
        await join();
      } finally {
        channel.db.close();
        gad.db.close();
      }
    },
  };
}
