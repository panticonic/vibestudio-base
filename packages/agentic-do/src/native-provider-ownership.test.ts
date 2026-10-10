import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { describe, expect, it } from "vitest";
import type { Context } from "@panticonic/pi-chord";
import type { Harness } from "@panticonic/pi-durable";
import type { RpcCaller, RpcClient, RpcCallOptions } from "@vibestudio/rpc";
import { schemaRpcClient, wireClientFor } from "@vibestudio/rpc/internal";
import { successfulTestRpcFetch } from "@vibestudio/durable/test-utils";
import type { ParticipantDescriptor, ChannelEvent } from "@workspace/harness";
import { AgentVesselBase } from "./agent-vessel.js";
import { ChannelClient } from "./channel-client.js";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import {
  createNativeChannelProvider,
  type NativeChannelProviderAdmission,
} from "./testing/native-channel-provider.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

const channelId = "provider-lifecycle";
const providerId = "do:workers/test:ProviderVessel:provider";
const channelCaller = {
  callerId: `do:workers/pubsub-channel:PubSubChannel:${channelId}`,
  callerKind: "do" as const,
};
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
class ProviderVessel extends AgentVesselBase {
  client: ChannelClient | null = null;
  body: (
    signal: AbortSignal,
  ) => Promise<{ result: unknown; isError?: boolean }> = async () => ({
    result: 42,
  });
  effects = 0;
  openings = 0;
  protected override get rpc(): RpcClient {
    const wire = wireClientFor(super.rpc);
    return schemaRpcClient({
      ...wire,
      call: async (
        destination: string,
        method: string,
        args: unknown[],
        options?: RpcCallOptions,
      ): Promise<unknown> => {
        // The ordinary authenticated request releases the constructor's title
        // write. This is the external host boundary; channel claims/readback
        // remain the real ChannelDO below.
        if (
          destination === "main" &&
          [
            "runtime.setTitle",
            "workspace-state.alarmClear",
            "workspace-state.alarmSet",
          ].includes(method)
        )
          return undefined;
        return wire.call(destination, method, args, options);
      },
    });
  }
  protected override participantId() {
    return providerId;
  }
  protected override getParticipantInfo(): ParticipantDescriptor {
    return { type: "agent", name: "Provider", handle: "provider" };
  }
  protected override createChannelClient(): ChannelClient {
    if (!this.client) throw Error("Missing genuine provider channel");
    return this.client;
  }
  protected override agentSession(_context?: Context): Promise<Harness> {
    this.openings++;
    throw Error("Finite provider lifecycle must not open reasoning");
  }
  protected override async handleAgentMethodCall(
    _channel: string,
    _method: string,
    _args: unknown,
    signal: AbortSignal,
  ) {
    this.effects++;
    return this.body(signal);
  }
}
async function fixture(
  deliver?: (
    original: () => Promise<{ result: unknown; isError?: boolean }>,
    admission: NativeChannelProviderAdmission,
    callId: string,
  ) => Promise<{ result: unknown; isError?: boolean }>,
) {
  const vessel = await createNativeVesselTestDO(ProviderVessel, {
    __objectKey: "provider",
    RPC_FETCH: successfulTestRpcFetch,
    WORKER_SOURCE: "workers/test",
    WORKER_CLASS_NAME: "ProviderVessel",
    WORKER_EFFECTIVE_VERSION: "a".repeat(64),
    WORKER_SOURCE_REF: `state:${"b".repeat(64)}`,
  });
  let lastAdmission: NativeChannelProviderAdmission | null = null;
  const provider = await createNativeChannelProvider({
    channelId,
    participantId: providerId,
    deliver: async (channel, callId, method, args, admission) => {
      lastAdmission = admission;
      const original = () =>
        vessel.callAs(
          channelCaller,
          "onMethodCall",
          channel,
          callId,
          method,
          args,
          admission,
        );
      return deliver ? deliver(original, admission, callId) : original();
    },
    cancel: async (channel, callId) => {
      await vessel.callAs(
        channelCaller,
        "cancelDirectMethodCall",
        channel,
        callId,
      );
    },
  });
  const caller = { callerId: providerId, callerKind: "do" as const };
  const rpc: RpcCaller = schemaRpcMock({
    async call(
      target: string,
      method: string,
      args: unknown[],
    ): Promise<unknown> {
      if (target === "main" && method === "workers.resolveService")
        return durableObjectServiceFixture(channelCaller.callerId);
      if (target !== channelCaller.callerId)
        throw Error(`Foreign fixture target ${target}`);
      return provider.channel.callAs(caller, method, ...args);
    },
    async stream() {
      throw Error("Finite provider fixture cannot stream");
    },
  });
  vessel.instance.client = new ChannelClient(rpc, {
    source: "workers/pubsub-channel",
    className: "PubSubChannel",
    objectKey: channelId,
  });
  return {
    vessel,
    provider,
    get admission() {
      if (!lastAdmission) throw Error("Missing actual admission");
      return lastAdmission;
    },
    async terminal(callId: string, eventOverride?: ChannelEvent) {
      const event =
        eventOverride ??
        (await provider.channel.callAs(
          caller,
          "getEnvelope",
          `terminal:${callId}`,
        ));
      if (!event) throw Error("Missing canonical terminal");
      return vessel.callAs(
        { callerId: "server", callerKind: "server" },
        "acceptChannelDelivery",
        {
          deliveryId: `delivery:${event.messageId}`,
          channelId,
          channelRef: {
            source: "workers/pubsub-channel",
            className: "PubSubChannel",
            objectKey: channelId,
          },
          participantId: providerId,
          subscriptionRevision: 1,
          eventSequence: event.id,
          envelope: { kind: "log", phase: "live", event },
          agenticContext: {
            version: 1,
            relationships: [],
            channelConfig: {},
            conversation: {
              lastCompletedSender: null,
              lastCompletedMessageId: null,
              lastCompletedSeq: null,
              previousCompletedSender: null,
              previousCompletedMessageId: null,
              previousCompletedSeq: null,
              agentStreak: 0,
            },
            replyToSenderId: null,
          },
        },
      );
    },
    async close() {
      try {
        await provider.close();
      } finally {
        vessel.db.close();
      }
    },
  };
}

describe("genuine provider ownership", () => {
  it("consumes the original never-admitted cancellation without creating provider or reasoning work", async () => {
    const f = await fixture();
    const callerId = "do:workers/test:MethodCaller:caller";
    const callId = "never-admitted";
    try {
      const original = {
        channelId,
        callerId,
        targetId: providerId,
        invocationId: callId,
        transportCallId: callId,
        method: "finite",
        turnId: "original-domain-turn",
      };
      await f.provider.channel.callAs(
        { callerId, callerKind: "do" },
        "cancelMethodCall",
        callerId,
        callId,
        original,
      );
      await expect(
        f.provider.channel.callAs(
          { callerId: providerId, callerKind: "do" },
          "getEnvelope",
          callId,
        ),
      ).resolves.toBeNull();
      expect(await f.terminal(callId)).toMatchObject({
        disposition: "processed",
      });
      expect(await f.terminal(callId)).toMatchObject({
        disposition: "processed",
      });
      expect(f.vessel.instance.effects).toBe(0);
      expect(f.vessel.instance.openings).toBe(0);
      expect(
        f.provider.channel.sql
          .exec(
            "SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?",
            callId,
          )
          .toArray(),
      ).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("deduplicates a settled body before canonical terminal and refuses its retired claim without opening reasoning", async () => {
    let f!: Awaited<ReturnType<typeof fixture>>;
    f = await fixture(async (original, admission, callId) => {
      const first = await original();
      // Repeated marking reads back the accepted claim; it is not a unique
      // dispatch permission. A lost reply redelivery must attach to this body.
      await expect(
        f.provider.markExecutionStarted(
          providerId,
          callId,
          admission.providerClaimGeneration,
        ),
      ).resolves.toEqual({ accepted: true });
      expect(await original()).toEqual(first);
      expect(f.vessel.instance.effects).toBe(1);
      return first;
    });
    try {
      // The real mailbox must deliver the terminal even when this provider
      // requests only explicitly addressed work.
      await f.provider.channel.callAs(
        { callerId: providerId, callerKind: "do" },
        "join",
        {
          participantId: providerId,
          operationId: "provider-addressed-membership",
          contextId: "ctx-1",
          metadata: { name: "Native provider", type: "agent" },
          delivery: "addressed",
          endpoint: {
            kind: "entity",
            entityId: providerId,
            invocation: "direct",
          },
          applicationConfig: null,
          replay: false,
        },
      );
      await expect(f.provider.invoke("dedup", "finite", {})).resolves.toEqual({
        result: 42,
      });
      expect(
        f.provider.channel.sql
          .exec(
            "SELECT participant_id FROM channel_delivery_mailbox WHERE participant_id = ? AND event_id = ?",
            providerId,
            "terminal:dedup",
          )
          .toArray(),
      ).toEqual([{ participant_id: providerId }]);
      expect(await f.terminal("dedup")).toMatchObject({
        disposition: "processed",
      });
      // Canonical terminal retires the cache; late old generation cannot
      // execute or manufacture another native conversation.
      await expect(
        f.vessel.callAs(
          channelCaller,
          "onMethodCall",
          channelId,
          "dedup",
          "finite",
          {},
          f.admission,
        ),
      ).rejects.toThrow(/no longer current/);
      expect(await f.terminal("dedup")).toMatchObject({
        disposition: "processed",
      });
      expect(f.vessel.instance.effects).toBe(1);
      expect(f.vessel.instance.openings).toBe(0);
    } finally {
      await f.close();
    }
  });

  it("reports original provider failure and consumes its genuine terminal without reasoning admission", async () => {
    const f = await fixture();
    const failure = new Error("actual product method failed");
    f.vessel.instance.body = async () => {
      throw failure;
    };
    try {
      await expect(f.provider.invoke("failed", "finite", {})).rejects.toThrow(
        failure.message,
      );
      expect(await f.terminal("failed")).toMatchObject({
        disposition: "processed",
      });
      expect(f.vessel.instance.effects).toBe(1);
      expect(f.vessel.instance.openings).toBe(0);
      await expect(
        f.vessel.callAs(
          channelCaller,
          "onMethodCall",
          channelId,
          "invalid",
          "finite",
          {},
          { invocationId: "invalid", providerClaimGeneration: 0 },
        ),
      ).rejects.toThrow(/actual channel provider claim/);
      expect(f.vessel.instance.effects).toBe(1);
    } finally {
      await f.close();
    }
  });

  it("actual canonical cancellation joins the admitted product body before acknowledgement", async () => {
    const f = await fixture(),
      entered = gate(),
      aborted = gate(),
      cleanup = gate();
    f.vessel.instance.body = async (signal) => {
      entered.resolve();
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted.resolve();
            resolve();
          },
          { once: true },
        ),
      );
      await cleanup.promise;
      throw signal.reason;
    };
    const operation = f.provider.invoke("cancelled", "finite", {});
    void operation.catch(() => undefined);
    try {
      await entered.promise;
      let acknowledged = false;
      const cancellation = f.provider.cancel("cancelled").then(() => {
        acknowledged = true;
      });
      void cancellation.catch(() => undefined);
      await aborted.promise;
      expect(acknowledged).toBe(false);
      expect(await f.terminal("cancelled")).toMatchObject({
        disposition: "processed",
      });
      expect(acknowledged).toBe(false);
      cleanup.resolve();
      await cancellation;
      await expect(operation).rejects.toThrow(/method call cancelled/);
      expect(acknowledged).toBe(true);
      expect(f.vessel.instance.effects).toBe(1);
      expect(f.vessel.instance.openings).toBe(0);
    } finally {
      cleanup.resolve();
      await operation.catch(() => undefined);
      await f.close();
    }
  });
});
