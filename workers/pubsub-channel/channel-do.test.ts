import { describe, expect, it, vi } from "vitest";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { rpcMethodAuthority, serializeRpcFailure } from "@vibestudio/rpc";
import {
  evaluateAuthority,
  requirementForPrincipals,
} from "@vibestudio/shared/authorization";
import { createTestRpcFetch } from "@vibestudio/durable/test-utils";
import {
  createTestDO,
  createTestDirectAuthority,
} from "@workspace/runtime/worker/test-utils";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  agenticEventFromLogEnvelope,
  agenticEventSchema,
  resolveShouldRespond,
  eventKindSchemas,
  isAgenticLogEventKind,
  type AgenticEvent,
  type BlockId,
  type InvocationId,
} from "@workspace/agentic-protocol";
import { GadWorkspaceDO } from "@workspace-workers/workspace-source";
import { PubSubChannel } from "./channel-do.js";
import type { ChannelLog } from "./log-store.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { EntityRecordSchema } from "@vibestudio/service-schemas/workspaceState";
import { accountProfileSchema } from "@vibestudio/service-schemas/account";

type TestDO<C extends new (ctx: any, env: any) => object> = Awaited<
  ReturnType<typeof createTestDO<C>>
>;
const channelTestRpcFetch = createTestRpcFetch((request) =>
  request.message.type === "request" &&
  request.message.method === "notification.signalUserInbox"
    ? true
    : null,
);
function activeEntityFixture(id: unknown) {
  return EntityRecordSchema.parse({
    id: String(id),
    authoritySessionId: "session-test",
    kind: "do",
    source: { repoPath: "workers/test", effectiveVersion: "ev-test" },
    contextId: "ctx-test",
    key: "test",
    createdAt: 1,
    status: "active",
    cleanupComplete: false,
  });
}

function profileFixture(userId: string) {
  return accountProfileSchema.parse({
    userId,
    handle: userId.replace(/^usr_/, ""),
    displayName: userId,
    role: "member",
  });
}
function canonicalLedger(instance: PubSubChannel) {
  return (instance as unknown as { channelLog: ChannelLog }).channelLog.ledger;
}
function canonicalAgenticEvents(instance: PubSubChannel): AgenticEvent[] {
  return canonicalLedger(instance)
    .read({ limit: Number.MAX_SAFE_INTEGER })
    .filter((envelope) => isAgenticLogEventKind(envelope.payloadKind))
    .map(
      (envelope) =>
        agenticEventSchema.parse(
          agenticEventFromLogEnvelope(envelope),
        ) as AgenticEvent,
    );
}
function canonicalAgenticEvent(
  instance: PubSubChannel,
  envelopeId: string,
): AgenticEvent {
  const envelope = canonicalLedger(instance).envelope(envelopeId);
  if (!envelope || !isAgenticLogEventKind(envelope.payloadKind))
    throw new Error(`Missing canonical agentic envelope ${envelopeId}`);
  return agenticEventSchema.parse(
    agenticEventFromLogEnvelope(envelope),
  ) as AgenticEvent;
}

async function appendOpaqueChannelPage(
  channel: TestDO<typeof PubSubChannel>,
): Promise<void> {
  const log = (channel.instance as unknown as { channelLog: ChannelLog })
    .channelLog;
  for (let index = 0; index < 501; index++) {
    await log.append({
      messageId: `opaque:${index}`,
      type: "test.opaque",
      payload: { index },
      senderId: "system:journal-test",
      contentClass: "internal",
      externalKeys: [],
    });
  }
}

const sessionWrappedInstances = new WeakSet<object>();
const subscriptionSinks = new WeakMap<
  object,
  { emitted?: unknown[]; emittedTargets?: string[] }
>();
const testSubscriptions = new WeakMap<
  object,
  Map<string, ReadableStreamDefaultReader<Uint8Array>>
>();

function testSubscriptionKey(
  participantId: string,
  subscriptionId: string,
): string {
  return `${participantId}\u0000${subscriptionId}`;
}

async function closeTestSubscription(
  instance: PubSubChannel,
  participantId: string,
  deliveryId: string,
): Promise<void> {
  const reader = testSubscriptions
    .get(instance)
    ?.get(testSubscriptionKey(participantId, deliveryId));
  if (!reader) return;
  testSubscriptions
    .get(instance)
    ?.delete(testSubscriptionKey(participantId, deliveryId));
  await reader.cancel();
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setRpcCaller(
  instance: PubSubChannel,
  callerId: string | null,
  callerKind: string | null,
  callerPanelId?: string | null,
  userId?: string,
): void {
  if (!sessionWrappedInstances.has(instance)) {
    sessionWrappedInstances.add(instance);
    const original = instance.subscribe.bind(instance);
    (
      instance as unknown as { subscribe: PubSubChannel["subscribe"] }
    ).subscribe = async (participantId, metadata, subscriptionId) => {
      const caller = (
        instance as unknown as {
          _currentVerifiedCaller?: {
            callerId?: string;
            callerPanelId?: string;
          };
        }
      )._currentVerifiedCaller;
      const deliveryId =
        caller?.callerPanelId ?? caller?.callerId ?? participantId;
      const ownedSubscriptionId = subscriptionId ?? deliveryId;
      const response = await original(
        participantId,
        metadata,
        ownedSubscriptionId,
      );
      if (!response.body) throw new Error("test subscription returned no body");
      const reader = response.body.getReader();
      const firstChunk = await reader.read();
      const first = firstChunk.done
        ? null
        : (JSON.parse(new TextDecoder().decode(firstChunk.value).trim()) as {
            kind?: string;
            result?: Record<string, unknown>;
          });
      if (first?.kind !== "subscribed" || !first.result) {
        throw new Error("test subscription did not receive its ACK");
      }
      const result = first.result;
      const canonicalParticipantId = String(
        result["participantId"] ?? participantId,
      );
      const byKey = testSubscriptions.get(instance) ?? new Map();
      testSubscriptions.set(instance, byKey);
      byKey.set(
        testSubscriptionKey(canonicalParticipantId, ownedSubscriptionId),
        reader,
      );
      const sink = subscriptionSinks.get(instance);
      void (async () => {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
          const record = JSON.parse(
            new TextDecoder().decode(chunk.value).trim(),
          ) as {
            kind?: string;
            payload?: unknown;
          };
          if (record.kind !== "message") continue;
          sink?.emitted?.push(record.payload);
          sink?.emittedTargets?.push(participantId);
        }
      })();
      // Unit tests call the method directly, so surface the first stream record
      // while the reader above continues to own the real response resource.
      return result as unknown as Response;
    };
  }
  (
    instance as unknown as { _currentRpcCallerId: string | null }
  )._currentRpcCallerId = callerId;
  (
    instance as unknown as { _currentRpcCallerKind: string | null }
  )._currentRpcCallerKind = callerKind;
  (
    instance as unknown as { _currentRpcCallerPanelId: string | null }
  )._currentRpcCallerPanelId = callerPanelId ?? null;
  (
    instance as unknown as { _currentVerifiedCaller: unknown }
  )._currentVerifiedCaller = callerId
    ? {
        callerId,
        callerKind: callerKind ?? "unknown",
        ...(callerPanelId ? { callerPanelId } : {}),
        ...(userId ? { userId } : {}),
      }
    : null;
}

async function joinEntity(
  instance: PubSubChannel,
  participantId: string,
  metadata: Record<string, unknown> = { name: "Agent", type: "agent" },
  contextId = "ctx-1",
): Promise<void> {
  setRpcCaller(instance, participantId, "durable-object");
  await instance.join({
    participantId,
    operationId: "join-1",
    contextId,
    metadata,
    delivery: "all",
    endpoint: { kind: "entity", entityId: participantId, invocation: "direct" },
    applicationConfig: null,
    replay: true,
  });
}

async function joinResidentSession(
  instance: PubSubChannel,
  participantId: string,
  metadata: Record<string, unknown> = {
    name: "Resident client",
    type: "client",
  },
  contextId = "ctx-1",
): Promise<void> {
  setRpcCaller(instance, participantId, "durable-object");
  await instance.join({
    participantId,
    operationId: "join-1",
    contextId,
    metadata,
    delivery: "all",
    endpoint: {
      kind: "entity",
      entityId: participantId,
      invocation: "mailbox",
    },
    applicationConfig: null,
    replay: true,
  });
}

function agenticEvent(kind = "message.completed") {
  return {
    kind,
    actor: { kind: "user", id: "panel:user" },
    causality: { messageId: "msg-1" },
    payload: {
      protocol: "agentic.trajectory.v1",
      role: "user",
      blocks: [{ blockId: "msg-1:block:0", type: "text", content: "hello" }],
      outcome: "completed",
    },
    createdAt: new Date().toISOString(),
  };
}

function messageTypeRegisteredEvent(
  typeId: string,
  code = "export default function App() { return null; }",
  imports?: Record<string, string>,
) {
  return {
    kind: "messageType.registered",
    actor: { kind: "panel", id: "panel:user" },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      typeId,
      displayMode: "row",
      source: { type: "code", code },
      ...(imports ? { imports } : {}),
    },
    createdAt: new Date().toISOString(),
  };
}

async function initializeChannelClone(
  child: TestDO<typeof PubSubChannel>,
  parentChannelId: string,
  targetContextId: string,
  sourceContextId = "source-context",
): Promise<void> {
  const objectKey = (child.instance as unknown as { objectKey: string })
    .objectKey;
  const ref = { source: "workers/pubsub-channel", className: "PubSubChannel" };
  const response = await child.instance.fetch(
    new Request(
      `http://test/${encodeURIComponent(objectKey)}/__lifecycle/initializeClone`,
      {
        method: "POST",
        body: JSON.stringify({
          args: [
            {
              provenance: {
                storage: "snapshot",
                operationContextId: targetContextId,
                sourceEntityId: `do:${ref.source}:${ref.className}:${parentChannelId}`,
                sourceContextId,
                sourceAuthoritySessionId: "source-session",
                sourceBuildKey: "b".repeat(64),
                sourceExecutionDigest: "e".repeat(64),
              },
              source: { ...ref, objectKey: parentChannelId },
              sourceContextId,
              target: { ...ref, objectKey },
              targetContextId,
              authoritySessionId: `clone:${objectKey}`,
              buildKey: "b".repeat(64),
              executionDigest: "e".repeat(64),
            },
          ],
          __instanceToken: "token",
          __instanceId: `do:${ref.source}:${ref.className}:${objectKey}`,
          __caller: {
            callerId: "main",
            callerKind: "server",
            authorization: createTestDirectAuthority({
              callerKind: "server",
              method: "__lifecycle/initializeClone",
              objectKey,
            }),
          },
        }),
      },
    ),
  );
  expect(response.status, await response.text()).toBe(200);
}

/** Copy the actual owner-local SQLite snapshot, as runtime.cloneContext does. */
function clonedChannelDatabase(parent: TestDO<typeof PubSubChannel>) {
  const Database = parent.db.constructor as new (
    data: Uint8Array,
  ) => TestDO<typeof PubSubChannel>["db"];
  return new Database(parent.db.export());
}

const workspaceBlobs = new WeakMap<object, Map<string, string>>();

async function createGadBackedChannel(
  options: {
    emitted?: unknown[];
    emittedTargets?: string[];
    channelKey?: string;
    gad?: TestDO<typeof GadWorkspaceDO>;
    db?: TestDO<typeof PubSubChannel>["db"];
    blobstorePutText?: (
      value: string,
    ) => Promise<{ digest: string; size: number }>;
    rpcCall?: (
      target: string,
      method: string,
      args: unknown[],
      options?: { readOnly?: boolean; timeoutMs?: number },
    ) => Promise<unknown> | unknown;
  } = {},
) {
  const gad =
    options.gad ??
    (await createTestDO(GadWorkspaceDO, {
      __objectKey: "workspace",
      RPC_FETCH: channelTestRpcFetch,
    }));
  const channel = await createTestDO(
    PubSubChannel,
    {
      __objectKey: options.channelKey ?? "channel-1",
    },
    options.db ? { db: options.db } : undefined,
  );
  subscriptionSinks.set(channel.instance, {
    emitted: options.emitted,
    emittedTargets: options.emittedTargets,
  });
  const gadTarget = "do:workers/workspace-source:GadWorkspaceDO:workspace";
  const blobs = workspaceBlobs.get(gad.instance) ?? new Map<string, string>();
  workspaceBlobs.set(gad.instance, blobs);
  // Initialize the real connectionless responder so calls through createTestDO
  // exercise receiver dispatch. Only replace its outbound client operations.
  const mockClient = {
    emit: vi.fn(async (target: string, _event: string, payload: unknown) => {
      options.emittedTargets?.push(target);
      options.emitted?.push(payload);
    }),
    call: vi.fn(
      async (
        target: string,
        method: string,
        args: unknown[],
        callOptions?: { readOnly?: boolean; timeoutMs?: number },
      ) => {
        const custom = await options.rpcCall?.(
          target,
          method,
          args,
          callOptions,
        );
        if (custom !== undefined) return custom;
        if (target === "main" && method === "workers.resolveService") {
          return durableObjectServiceFixture(gadTarget, {
            source: "vibestudio/internal",
            className: "GadWorkspaceDO",
            objectKey: "workspace",
          });
        }
        if (target === "main" && method === "runtime.setTitle") {
          // Title registry isn't relevant in unit tests; treat as a no-op.
          return undefined;
        }
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (
          target === "main" &&
          (method === "workspace-state.alarmSet" ||
            method === "workspace-state.alarmClear")
        ) {
          // DurableBase persists alarm metadata through main; these channel tests
          // exercise channel behavior, so acknowledge the lifecycle write.
          return undefined;
        }
        if (target === "main" && method === "blobstore.putText") {
          const value = String(args[0] ?? "");
          const blob = options.blobstorePutText
            ? await options.blobstorePutText(value)
            : {
                digest: sha256HexSyncText(value),
                size: value.length,
              };
          blobs.set(blob.digest, value);
          return blob;
        }
        if (target === "main" && method === "blobstore.getText") {
          return blobs.get(String(args[0] ?? "")) ?? null;
        }
        if (target === gadTarget) {
          const callerId = `do:workers/pubsub-channel:PubSubChannel:${options.channelKey ?? "channel-1"}`;
          return await gad.callAs(
            { callerId, callerKind: "do" },
            method,
            ...args,
          );
        }
        throw new Error(`unexpected rpc call ${target}.${method}`);
      },
    ),
    expose: () => {},
    exposeAll: () => {},
    on: () => () => {},
  };
  void (channel.instance as unknown as { rpc: unknown }).rpc;
  const connectionless = (
    channel.instance as unknown as {
      _connectionless: { client: Record<string, unknown> };
    }
  )._connectionless;
  Object.assign(connectionless.client, mockClient);
  return { gad, blobs, ...channel };
}

describe("PubSubChannel", () => {
  it("admits workspace publication intents into canonical owner history before graph observation", async () => {
    const emitted: unknown[] = [];
    const channel = await createGadBackedChannel({ emitted });
    setRpcCaller(channel.instance, "panel:watcher", "panel");
    await channel.instance.subscribe("panel:watcher", {
      contextId: "ctx-1",
      type: "panel",
    });
    emitted.length = 0;
    const source = await channel.gad.instance.appendLogEvent({
      logId: "trajectory:publisher",
      head: "main",
      logKind: "trajectory",
      events: [
        {
          envelopeId: "source-publication",
          actor: { kind: "agent", id: "original-agent" },
          payloadKind: AGENTIC_EVENT_PAYLOAD_KIND,
          payload: {
            ...agenticEvent(),
            actor: { kind: "agent", id: "original-agent" },
          },
          appendedAt: "2026-10-10T00:00:00.000Z",
          publish: { channels: [{ channelId: "channel-1" }] },
        },
      ],
    });
    expect(source.published).toHaveLength(1);
    expect(
      channel.gad.instance.readLog({ logId: "channel-1", head: "main" }),
    ).toEqual([]);
    const [claim] = channel.gad.instance.claimReadyWork(
      "workspace-publication",
      { workerId: "driver-publisher", now: Date.now(), limit: 1 },
    );
    const intents = (
      claim!.payload as {
        intents: import("@workspace/agentic-protocol").LogAppendEventInput[];
      }
    ).intents;
    await expect(
      channel.call("admitPublishedEnvelopes", intents),
    ).resolves.toEqual({ admitted: 1 });
    const event = await channel.instance.getEnvelope(
      "pub:source-publication:channel-1",
    );
    expect(event).toMatchObject({
      id: 2,
      senderId: "original-agent",
      payload: { actor: { kind: "agent", id: "original-agent" } },
    });
    expect(
      canonicalLedger(channel.instance).envelope(
        "pub:source-publication:channel-1",
      ),
    ).toMatchObject({
      appendedAt: source.envelopes[0]!.appendedAt,
      causality: {
        originLogId: "trajectory:publisher",
        originEnvelopeId: "source-publication",
      },
    });
    expect(emitted).toHaveLength(1);
    await expect(
      channel.call("admitPublishedEnvelopes", intents),
    ).resolves.toEqual({ admitted: 1 });
    expect(canonicalLedger(channel.instance).headSequence()).toBe(2);
    expect(emitted).toHaveLength(1);
    const changed = structuredClone(intents);
    changed[0]!.payload = {
      ...(changed[0]!.payload as AgenticEvent),
      createdAt: "2026-10-11T00:00:00.000Z",
    };
    await expect(
      channel.call("admitPublishedEnvelopes", changed),
    ).rejects.toThrow("different canonical content");
    expect(canonicalLedger(channel.instance).headSequence()).toBe(2);
    expect(emitted).toHaveLength(1);
    expect(
      channel.gad.instance.readLog({ logId: "channel-1", head: "main" }),
    ).toEqual([]);
  });

  it.each([
    "direct acknowledgement",
    "overlapping host claim",
    "activation loss",
  ] as const)(
    "settles direct delivery through its canonical mailbox after %s",
    async (mode) => {
      const entered = deferred<void>();
      const release = deferred<void>();
      let delivered: { deliveryId: string } | undefined;
      const channel = await createGadBackedChannel({
        rpcCall: async (_target, method, args) => {
          if (method !== "acceptChannelDelivery") return undefined;
          delivered = args[0] as typeof delivered;
          entered.resolve();
          await release.promise;
          return {
            deliveryId: delivered!.deliveryId,
            disposition: "processed",
          };
        },
      });
      await joinEntity(
        channel.instance,
        "do:workers/agent-worker:AiChatWorker:direct-ack",
      );
      setRpcCaller(channel.instance, "panel:user", "panel");
      await channel.instance.subscribe("panel:user", {
        contextId: "ctx-1",
        type: "panel",
      });
      try {
        const receipt = await channel.instance.publish(
          "panel:user",
          "direct.test",
          { value: mode },
        );
        await entered.promise;
        expect(
          channel.sql
            .exec(
              `SELECT state FROM channel_delivery_mailbox WHERE event_id = ?`,
              receipt.messageId,
            )
            .toArray(),
        ).toEqual([{ state: "ready" }]);
        let claim:
          | ReturnType<PubSubChannel["claimReadyWork"]>[number]
          | undefined;
        if (mode === "overlapping host claim")
          [claim] = channel.instance.claimReadyWork("channel-delivery", {
            workerId: "driver-overlap",
            now: Date.now(),
            limit: 1,
          });
        const reopened =
          mode === "activation loss"
            ? await createGadBackedChannel({
                gad: channel.gad,
                db: clonedChannelDatabase(channel),
              })
            : null;
        release.resolve();
        await (
          channel.instance as unknown as {
            publicationQueue: { drain(): Promise<void> };
          }
        ).publicationQueue.drain();
        if (claim) {
          expect(
            channel.sql
              .exec(
                `SELECT state FROM channel_delivery_mailbox WHERE event_id = ?`,
                receipt.messageId,
              )
              .toArray(),
          ).toEqual([{ state: "leased" }]);
          expect(
            channel.instance.settleReadyWork("channel-delivery", {
              workerId: "driver-overlap",
              itemId: claim.itemId,
              generation: claim.generation,
              outcome: {
                deliveryId: delivered!.deliveryId,
                disposition: "processed",
              },
            }),
          ).toBe("accepted");
        }
        expect(
          channel.instance.claimReadyWork("channel-delivery", {
            workerId: "driver-post-ack",
            now: Date.now(),
            limit: 1,
          }),
        ).toEqual([]);
        if (reopened) {
          const [recovered] = reopened.instance.claimReadyWork(
            "channel-delivery",
            { workerId: "driver-recovered", now: Date.now(), limit: 1 },
          );
          expect(
            (
              recovered!.payload as {
                delivery: { deliveryId: string; eventSequence: number };
              }
            ).delivery,
          ).toMatchObject({
            deliveryId: delivered!.deliveryId,
            eventSequence: receipt.id,
          });
        }
      } finally {
        release.resolve();
        await (
          channel.instance as unknown as {
            publicationQueue: { drain(): Promise<void> };
          }
        ).publicationQueue.drain();
      }
    },
  );

  it("keeps an empty root observation immutable while a local append advances history", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const channel = await createGadBackedChannel({
      rpcCall: async (_target, method) => {
        if (method === "initializeLogHead") {
          entered.resolve();
          await release.promise;
        }
        return undefined;
      },
    });
    const waiting = channel.instance.waitObservedThrough(0);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    const [root] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "driver-empty-root",
      now: Date.now(),
      limit: 1,
    });
    expect(root!.payload).toMatchObject({ observation: { kind: "root" } });
    await expect(
      channel.instance.prepareChannelObservationClaim({
        itemId: root!.itemId,
        generation: root!.generation,
      }),
    ).rejects.toThrow("no longer owns its claim");
    const observing = channel.instance.executeChannelObservationClaim({
      itemId: root!.itemId,
      generation: root!.generation,
    });
    try {
      await entered.promise;
      setRpcCaller(channel.instance, "panel:user", "panel");
      await channel.instance.subscribe("panel:user", {
        contextId: "ctx-1",
        type: "panel",
      });
      expect(settled).toBe(false);
      expect(canonicalLedger(channel.instance).headSequence()).toBe(1);
      release.resolve();
      const outcome = await observing;
      expect(
        channel.instance.settleReadyWork("channel-observation", {
          workerId: "driver-empty-root",
          itemId: root!.itemId,
          generation: root!.generation,
          outcome,
        }),
      ).toBe("accepted");
      await expect(waiting).resolves.toMatchObject({ observedSequence: 0 });
      const [next] = channel.instance.claimReadyWork("channel-observation", {
        workerId: "driver-empty-root",
        now: Date.now(),
        limit: 1,
      });
      expect(next).toBeDefined();
      expect(next!.payload).toMatchObject({ observation: { kind: "append" } });
      await expect(
        channel.instance.prepareChannelObservationClaim({
          itemId: next!.itemId,
          generation: next!.generation,
        }),
      ).rejects.toThrow("no longer owns its claim");
      expect(canonicalLedger(channel.instance).observedSequence()).toBe(0);
      expect(canonicalLedger(channel.instance).peekObservation()).toMatchObject(
        { kind: "append", sequence: 1 },
      );
    } finally {
      release.resolve();
      await Promise.allSettled([observing, waiting]);
    }
  });

  it("retains the empty root claim identity across worker replacement and a local append", async () => {
    const channel = await createGadBackedChannel();
    const [old] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "driver-root-old",
      now: Date.now(),
      limit: 1,
    });
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.instance.adoptDurableWorkWorker("driver-root-new");
    const [reclaimed] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "driver-root-new",
      now: Date.now(),
      limit: 1,
    });
    expect(reclaimed!.itemId).toBe(old!.itemId);
    const receipt = await channel.instance.executeChannelObservationClaim({
      itemId: reclaimed!.itemId,
      generation: reclaimed!.generation,
    });
    expect(receipt.observedSequence).toBe(0);
    expect(
      channel.instance.settleReadyWork("channel-observation", {
        workerId: "driver-root-old",
        itemId: old!.itemId,
        generation: old!.generation,
        outcome: receipt,
      }),
    ).toBe("stale");
    expect(
      channel.instance.settleReadyWork("channel-observation", {
        workerId: "driver-root-new",
        itemId: reclaimed!.itemId,
        generation: reclaimed!.generation,
        outcome: receipt,
      }),
    ).toBe("accepted");
    expect(canonicalLedger(channel.instance).hasObservedRoot()).toBe(true);
    expect(canonicalLedger(channel.instance).observedSequence()).toBe(0);
    expect(canonicalLedger(channel.instance).peekObservation()).toMatchObject({
      kind: "append",
      sequence: 1,
    });
  });

  it.each(["observed prefix", "original failure"] as const)(
    "prepares only the exact leased fork prerequisite through its %s",
    async (mode) => {
      const parent = await createGadBackedChannel({
        channelKey: "observation-parent",
      });
      setRpcCaller(parent.instance, "panel:user", "panel");
      await parent.instance.subscribe("panel:user", {
        contextId: "ctx-1",
        type: "panel",
      });
      const parentHead = canonicalLedger(parent.instance).headSequence();
      const boundary = canonicalLedger(parent.instance).at(parentHead)!;
      const entered = deferred<void>();
      const original = Object.assign(new Error("parent observation refused"), {
        code: "PARENT_OBSERVATION_REFUSED",
        cause: new Error("original storage failure"),
      });
      let prerequisiteCalls = 0;
      const child = await createGadBackedChannel({
        channelKey: "observation-child",
        gad: parent.gad,
        db: clonedChannelDatabase(parent),
        rpcCall: async (target, method, args) => {
          if (
            target === "main" &&
            method === "workers.resolveService" &&
            args[1] === "observation-parent"
          )
            return durableObjectServiceFixture(
              "do:workers/pubsub-channel:PubSubChannel:observation-parent",
              {
                source: "workers/pubsub-channel",
                className: "PubSubChannel",
                objectKey: "observation-parent",
              },
            );
          if (
            target ===
              "do:workers/pubsub-channel:PubSubChannel:observation-parent" &&
            method === "waitObservedThrough"
          ) {
            prerequisiteCalls++;
            entered.resolve();
            if (mode === "original failure") throw original;
            return parent.instance.waitObservedThrough(Number(args[0]));
          }
          return undefined;
        },
      });
      await initializeChannelClone(child, "observation-parent", "fork-context");
      await child.instance.postClone(
        "observation-parent",
        parentHead,
        "fork-context",
      );
      const [old] = child.instance.claimReadyWork("channel-observation", {
        workerId: "fork-old",
        now: Date.now(),
        limit: 1,
      });
      expect(old!.payload).toMatchObject({ observation: { kind: "fork" } });
      await child.instance.adoptDurableWorkWorker("fork-new");
      const [claim] = child.instance.claimReadyWork("channel-observation", {
        workerId: "fork-new",
        now: Date.now(),
        limit: 1,
      });
      await expect(
        child.instance.prepareChannelObservationClaim({
          itemId: old!.itemId,
          generation: old!.generation,
        }),
      ).rejects.toThrow("no longer owns its claim");
      expect(prerequisiteCalls).toBe(0);
      const preparing = child.instance.prepareChannelObservationClaim({
        itemId: claim!.itemId,
        generation: claim!.generation,
      });
      const result = preparing.then(
        () => undefined,
        (error: unknown) => error,
      );
      await entered.promise;
      if (mode === "original failure") {
        expect(await result).toBe(original);
        expect(canonicalLedger(child.instance).peekObservation()).toMatchObject(
          {
            kind: "fork",
            throughSequence: parentHead,
            expectedParentHash: boundary.hash,
          },
        );
        expect(
          child.sql
            .exec(
              `SELECT disposition,generation FROM channel_observation_claim WHERE singleton=1`,
            )
            .toArray(),
        ).toEqual([{ disposition: "leased", generation: claim!.generation }]);
      } else {
        let settled = false;
        void preparing.then(() => {
          settled = true;
        });
        expect(settled).toBe(false);
        await parent.instance.publish("panel:user", "after.fork", { value: 1 });
        const workerId = "parent-observer";
        const [parentClaim] = parent.instance.claimReadyWork(
          "channel-observation",
          { workerId, now: Date.now(), limit: 1 },
        );
        const outcome = await parent.instance.executeChannelObservationClaim({
          itemId: parentClaim!.itemId,
          generation: parentClaim!.generation,
        });
        expect(
          parent.instance.settleReadyWork("channel-observation", {
            workerId,
            itemId: parentClaim!.itemId,
            generation: parentClaim!.generation,
            outcome,
          }),
        ).toBe("accepted");
        await expect(preparing).resolves.toBeUndefined();
        const fork = await child.instance.executeChannelObservationClaim({
          itemId: claim!.itemId,
          generation: claim!.generation,
        });
        expect(fork).toEqual({
          observedSequence: parentHead,
          hash: boundary.hash,
        });
        expect(
          child.instance.settleReadyWork("channel-observation", {
            workerId: "fork-new",
            itemId: claim!.itemId,
            generation: claim!.generation,
            outcome: fork,
          }),
        ).toBe("accepted");
      }
      expect(prerequisiteCalls).toBe(1);
    },
  );

  it("drains a retained workspace publication before capturing the receiving channel release frontier", async () => {
    const channel = await createGadBackedChannel();
    expect(
      await channel.instance.prepareDurableWorkRelease("peer-obligations"),
    ).toEqual({ queues: [], barrier: null });
    setRpcCaller(channel.instance, "panel:watcher", "panel");
    await channel.instance.subscribe("panel:watcher", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.gad.instance.appendLogEvent({
      logId: "trajectory:retirement",
      head: "main",
      logKind: "trajectory",
      events: [
        {
          envelopeId: "owed-before-retirement",
          actor: { kind: "agent", id: "publisher" },
          payloadKind: AGENTIC_EVENT_PAYLOAD_KIND,
          payload: agenticEvent(),
          publish: { channels: [{ channelId: "channel-1" }] },
        },
      ],
    });
    const workerId = "driver-retirement";
    const [publication] = channel.gad.instance.claimReadyWork(
      "workspace-publication",
      { workerId, now: Date.now(), limit: 1 },
    );
    const peer =
      await channel.gad.instance.prepareDurableWorkRelease("peer-obligations");
    const peerWaiting = channel.gad.instance.waitDurableWorkRelease(
      "peer-obligations",
      peer.barrier,
    );
    let peerSettled = false;
    void peerWaiting.then(
      () => {
        peerSettled = true;
      },
      () => {
        peerSettled = true;
      },
    );
    const entered = deferred<void>();
    const release = deferred<void>();
    const log = (channel.instance as unknown as { channelLog: ChannelLog })
      .channelLog;
    const append = log.appendPrepared.bind(log);
    log.appendPrepared = async (input) => {
      entered.resolve();
      await release.promise;
      return append(input);
    };
    const intents = (
      publication!.payload as {
        intents: import("@workspace/agentic-protocol").LogAppendEventInput[];
      }
    ).intents;
    const admitting = channel.instance.admitPublishedEnvelopes(intents);
    try {
      await entered.promise;
      expect(peerSettled).toBe(false);
      expect(canonicalLedger(channel.instance).headSequence()).toBe(1);
      release.resolve();
      const outcome = await admitting;
      expect(
        channel.gad.instance.settleReadyWork("workspace-publication", {
          workerId,
          itemId: publication!.itemId,
          generation: publication!.generation,
          outcome,
        }),
      ).toBe("accepted");
      await peerWaiting;
      const receiver =
        await channel.instance.prepareDurableWorkRelease("owner");
      await expect(
        channel.instance.waitDurableWorkRelease("owner", { foreign: true }),
      ).rejects.toThrow("does not own");
      const receiverWaiting = channel.instance.waitDurableWorkRelease(
        "owner",
        receiver.barrier,
      );
      expect(canonicalLedger(channel.instance).headSequence()).toBe(2);
      while (canonicalLedger(channel.instance).observedSequence() < 2) {
        const [claim] = channel.instance.claimReadyWork("channel-observation", {
          workerId,
          now: Date.now(),
          limit: 1,
        });
        expect(claim).toBeDefined();
        const observed = await channel.instance.executeChannelObservationClaim({
          itemId: claim!.itemId,
          generation: claim!.generation,
        });
        expect(
          channel.instance.settleReadyWork("channel-observation", {
            workerId,
            itemId: claim!.itemId,
            generation: claim!.generation,
            outcome: observed,
          }),
        ).toBe("accepted");
      }
      await receiverWaiting;
      await expect(
        channel.instance.waitDurableWorkRelease("owner", receiver.barrier),
      ).resolves.toBeUndefined();
      await expect(
        channel.instance.getEnvelope("pub:owed-before-retirement:channel-1"),
      ).resolves.toMatchObject({ id: 2 });
      await expect(
        channel.instance.admitPublishedEnvelopes(intents),
      ).rejects.toThrow("publication owner is closing");
    } finally {
      release.resolve();
      const [admission] = await Promise.allSettled([admitting]);
      if (admission.status === "fulfilled")
        channel.gad.instance.settleReadyWork("workspace-publication", {
          workerId,
          itemId: publication!.itemId,
          generation: publication!.generation,
          outcome: admission.value,
        });
      else
        channel.gad.instance.failReadyWork("workspace-publication", {
          workerId,
          itemId: publication!.itemId,
          generation: publication!.generation,
          error: serializeRpcFailure(admission.reason),
        });
      await Promise.allSettled([peerWaiting]);
      log.appendPrepared = append;
    }
  });

  it("observes one frozen prefix while later appends remain independent canonical debt", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let held = true;
    const requests: { events: { envelopeId: string }[] }[] = [];
    const channel = await createGadBackedChannel({
      rpcCall: async (_target, method, args) => {
        if (method === "appendLogEvent") {
          requests.push(args[0] as { events: { envelopeId: string }[] });
          if (held) {
            entered.resolve();
            await release.promise;
          }
        }
        return undefined;
      },
    });
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.instance.publish("panel:user", "batch.first", { value: 1 });
    const workerId = "driver-batched";
    const [first] = channel.instance.claimReadyWork("channel-observation", {
      workerId,
      now: Date.now(),
      limit: 1,
    });
    const observing = channel.instance.executeChannelObservationClaim({
      itemId: first!.itemId,
      generation: first!.generation,
    });
    try {
      await entered.promise;
      const later = await channel.instance.publish(
        "panel:user",
        "batch.later",
        { value: 2 },
      );
      expect(requests[0]!.events).toHaveLength(2);
      const prefix = canonicalLedger(channel.instance).at(1)!;
      expect(() =>
        channel.instance.settleReadyWork("channel-observation", {
          workerId,
          itemId: first!.itemId,
          generation: first!.generation,
          outcome: {
            observedSequence: 1,
            envelopeId: String(prefix.envelopeId),
            hash: prefix.hash,
          },
        }),
      ).toThrow("changed its canonical event");
      expect(canonicalLedger(channel.instance).observedSequence()).toBe(0);
      release.resolve();
      held = false;
      const firstOutcome = await observing;
      expect(firstOutcome.observedSequence).toBe(2);
      expect(
        channel.instance.settleReadyWork("channel-observation", {
          workerId,
          itemId: first!.itemId,
          generation: first!.generation,
          outcome: firstOutcome,
        }),
      ).toBe("accepted");
      expect(
        channel.instance.settleReadyWork("channel-observation", {
          workerId,
          itemId: first!.itemId,
          generation: first!.generation,
          outcome: firstOutcome,
        }),
      ).toBe("duplicate");
      expect(canonicalLedger(channel.instance).observedSequence()).toBe(2);
      expect(
        (await channel.instance.getReplayAfter({ after: 0 })).logEvents,
      ).toHaveLength(3);
      const [next] = channel.instance.claimReadyWork("channel-observation", {
        workerId,
        now: Date.now(),
        limit: 1,
      });
      expect(
        channel.instance.settleReadyWork("channel-observation", {
          workerId,
          itemId: first!.itemId,
          generation: first!.generation,
          outcome: firstOutcome,
        }),
      ).toBe("stale");
      const nextOutcome = await channel.instance.executeChannelObservationClaim(
        { itemId: next!.itemId, generation: next!.generation },
      );
      expect(nextOutcome.observedSequence).toBe(later.id);
      expect(
        channel.instance.settleReadyWork("channel-observation", {
          workerId,
          itemId: next!.itemId,
          generation: next!.generation,
          outcome: nextOutcome,
        }),
      ).toBe("accepted");
      expect(requests[1]!.events).toHaveLength(1);
      expect(
        channel.gad.instance.readLog({ logId: "channel-1", head: "main" }),
      ).toHaveLength(3);
    } finally {
      release.resolve();
      await Promise.allSettled([observing]);
    }
  });

  it("reclaims the same frozen observation prefix after worker ownership changes", async () => {
    const channel = await createGadBackedChannel();
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.instance.publish("panel:user", "batch.before", { value: 1 });
    const [old] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "driver-old-batch",
      now: Date.now(),
      limit: 1,
    });
    await channel.instance.publish("panel:user", "batch.after", { value: 2 });
    await channel.instance.adoptDurableWorkWorker("driver-new-batch");
    const [reclaimed] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "driver-new-batch",
      now: Date.now(),
      limit: 1,
    });
    expect(reclaimed!.itemId).toBe(old!.itemId);
    expect(reclaimed!.generation).toBeGreaterThan(old!.generation);
    const receipt = await channel.instance.executeChannelObservationClaim({
      itemId: reclaimed!.itemId,
      generation: reclaimed!.generation,
    });
    expect(receipt.observedSequence).toBe(2);
    expect(
      channel.instance.settleReadyWork("channel-observation", {
        workerId: "driver-old-batch",
        itemId: old!.itemId,
        generation: old!.generation,
        outcome: receipt,
      }),
    ).toBe("stale");
    expect(canonicalLedger(channel.instance).observedSequence()).toBe(0);
    expect(
      channel.instance.settleReadyWork("channel-observation", {
        workerId: "driver-new-batch",
        itemId: reclaimed!.itemId,
        generation: reclaimed!.generation,
        outcome: receipt,
      }),
    ).toBe("accepted");
    expect(canonicalLedger(channel.instance).peekObservation()).toMatchObject({
      kind: "append",
      sequence: 3,
    });
  });

  it.each(["same channel", "cross channel"] as const)(
    "joins held nested direct publications before owner sealing on the %s",
    async (mode) => {
      const outerEntered = deferred<void>();
      const releaseOuter = deferred<void>();
      const innerEntered = deferred<void>();
      const releaseInner = deferred<void>();
      let destination!: PubSubChannel;
      const receive = async (
        _target: string,
        method: string,
        args: unknown[],
      ) => {
        if (method !== "acceptChannelDelivery") return undefined;
        const delivery = args[0] as {
          deliveryId: string;
          envelope: { event: { type: string } };
        };
        if (delivery.envelope.event.type === "nested.outer") {
          outerEntered.resolve();
          await releaseOuter.promise;
          setRpcCaller(destination, "panel:user", "panel");
          await destination.publish("panel:user", "nested.inner", { value: 2 });
        } else if (delivery.envelope.event.type === "nested.inner") {
          innerEntered.resolve();
          await releaseInner.promise;
        }
        return { deliveryId: delivery.deliveryId, disposition: "processed" };
      };
      const source = await createGadBackedChannel({
        channelKey: "nested-source",
        rpcCall: receive,
      });
      const target =
        mode === "same channel"
          ? source
          : await createGadBackedChannel({
              channelKey: "nested-target",
              gad: source.gad,
              rpcCall: receive,
            });
      destination = target.instance;
      for (const channel of new Set([source, target])) {
        await joinEntity(
          channel.instance,
          `do:workers/agent-worker:AiChatWorker:${channel === source ? "outer" : "inner"}`,
        );
        setRpcCaller(channel.instance, "panel:user", "panel");
        await channel.instance.subscribe("panel:user", {
          contextId: "ctx-1",
          type: "panel",
        });
      }
      const oldTarget =
        await target.instance.prepareDurableWorkRelease("delivery");
      await source.instance.publish("panel:user", "nested.outer", { value: 1 });
      await outerEntered.promise;
      const sourceCapture =
        await source.instance.prepareDurableWorkRelease("delivery");
      let sourceDone = false;
      const sourceWaiting = source.instance
        .waitDurableWorkRelease("delivery", sourceCapture.barrier)
        .then(() => {
          sourceDone = true;
        });
      try {
        expect(sourceDone).toBe(false);
        releaseOuter.resolve();
        await innerEntered.promise;
        const targetCapture =
          await target.instance.prepareDurableWorkRelease("delivery");
        expect(targetCapture.barrier).not.toEqual(oldTarget.barrier);
        let targetDone = false;
        const targetWaiting = target.instance
          .waitDurableWorkRelease("delivery", targetCapture.barrier)
          .then(() => {
            targetDone = true;
          });
        expect(targetDone).toBe(false);
        releaseInner.resolve();
        await Promise.all([sourceWaiting, targetWaiting]);
        const owner = await target.instance.prepareDurableWorkRelease("owner");
        expect((owner.barrier as { headSequence: number }).headSequence).toBe(
          canonicalLedger(target.instance).headSequence(),
        );
        expect(
          target.sql
            .exec(
              `SELECT delivery_id FROM channel_delivery_mailbox WHERE state IN ('ready','leased','retrying')`,
            )
            .toArray(),
        ).toEqual([]);
      } finally {
        releaseOuter.resolve();
        releaseInner.resolve();
        await Promise.allSettled([sourceWaiting]);
        await Promise.all(
          [...new Set([source, target])].map((channel) =>
            (
              channel.instance as unknown as {
                publicationQueue: { drain(): Promise<void> };
              }
            ).publicationQueue.drain(),
          ),
        );
      }
    },
  );

  it("preserves an owed delivery failure across activation and clears it only on genuine recovery acknowledgement", async () => {
    const original = Object.assign(
      new Error("direct receiver refused", {
        cause: new Error("original provider cause"),
      }),
      { code: "RECEIVER_REFUSED" },
    );
    const channel = await createGadBackedChannel({
      rpcCall: (_target, method) => {
        if (method === "acceptChannelDelivery") throw original;
        return undefined;
      },
    });
    await joinEntity(
      channel.instance,
      "do:workers/agent-worker:AiChatWorker:failure-owner",
    );
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.instance.publish("panel:user", "failure.owed", { value: 1 });
    const capture =
      await channel.instance.prepareDurableWorkRelease("delivery");
    await expect(
      channel.instance.waitDurableWorkRelease("delivery", capture.barrier),
    ).rejects.toMatchObject({
      message: original.message,
      code: "RECEIVER_REFUSED",
      cause: expect.objectContaining({ message: "original provider cause" }),
    });
    const reopened = await createGadBackedChannel({
      gad: channel.gad,
      db: channel.db,
    });
    const recoveredCapture =
      await reopened.instance.prepareDurableWorkRelease("delivery");
    await expect(
      reopened.instance.waitDurableWorkRelease(
        "delivery",
        recoveredCapture.barrier,
      ),
    ).rejects.toMatchObject({
      message: original.message,
      code: "RECEIVER_REFUSED",
      cause: expect.objectContaining({ message: "original provider cause" }),
    });
    const workerId = "driver-failure-recovery";
    const [claim] = reopened.instance.claimReadyWork("channel-delivery", {
      workerId,
      now: Date.now(),
      limit: 1,
    });
    expect(claim).toBeDefined();
    expect(
      reopened.instance.settleReadyWork("channel-delivery", {
        workerId,
        itemId: claim!.itemId,
        generation: claim!.generation,
        outcome: { deliveryId: claim!.itemId, disposition: "processed" },
      }),
    ).toBe("accepted");
    await expect(
      reopened.instance.waitDurableWorkRelease(
        "delivery",
        recoveredCapture.barrier,
      ),
    ).resolves.toBeUndefined();
    await expect(
      channel.instance.waitDurableWorkRelease("delivery", capture.barrier),
    ).resolves.toBeUndefined();
    expect(
      reopened.sql
        .exec(
          `SELECT last_failure_json FROM channel_delivery_mailbox WHERE delivery_id = ?`,
          claim!.itemId,
        )
        .toArray(),
    ).toEqual([{ last_failure_json: null }]);
    await expect(
      reopened.instance.prepareDurableWorkRelease("owner"),
    ).resolves.toMatchObject({ queues: ["channel-observation"] });
  });

  it("cancels delivery completion observation while a direct callback remains independently owned", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let callbackCompleted = false;
    const channel = await createGadBackedChannel({
      rpcCall: async (_target, method, args) => {
        if (method !== "acceptChannelDelivery") return undefined;
        const delivery = args[0] as { deliveryId: string };
        entered.resolve();
        await release.promise;
        callbackCompleted = true;
        return { deliveryId: delivery.deliveryId, disposition: "processed" };
      },
    });
    await joinEntity(
      channel.instance,
      "do:workers/agent-worker:AiChatWorker:held-cancelled-closure",
    );
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    const event = await channel.instance.publish("panel:user", "held.closure", {
      value: 1,
    });
    await entered.promise;
    const capture =
      await channel.instance.prepareDurableWorkRelease("delivery");
    const controller = new AbortController();
    const owner = channel.instance as unknown as {
      _invocationContext: { run<T>(context: unknown, operation: () => T): T };
      deliveryWaiters: Set<unknown>;
      publicationQueue: {
        drain(): Promise<void>;
        completionObservers: Set<unknown>;
        completions: Set<unknown>;
      };
    };
    const registered = deferred<void>();
    const observers = owner.publicationQueue.completionObservers;
    const add = observers.add.bind(observers);
    observers.add = (observer) => {
      const added = add(observer);
      registered.resolve();
      return added;
    };
    const original = Object.assign(new Error("release observation cancelled"), {
      code: "ECANCELLED",
    });
    const waiting = owner._invocationContext.run(
      {
        authorityActive: true,
        requestSignal: controller.signal,
        requestId: "held-direct-closure",
        callerId: "main",
        callerKind: "server",
      },
      () =>
        channel.instance.waitDurableWorkRelease("delivery", capture.barrier),
    );
    try {
      await registered.promise;
      expect(observers.size).toBe(1);
      controller.abort(original);
      await expect(waiting).rejects.toBe(original);
      expect(callbackCompleted).toBe(false);
      expect(observers.size).toBe(0);
      expect(owner.publicationQueue.completions.size).toBeGreaterThan(0);
      expect(owner.deliveryWaiters.size).toBe(0);
      expect(
        channel.sql
          .exec(
            `SELECT state FROM channel_delivery_mailbox WHERE event_id = ?`,
            event.messageId,
          )
          .toArray(),
      ).toEqual([{ state: "ready" }]);
      release.resolve();
      await owner.publicationQueue.drain();
      expect(callbackCompleted).toBe(true);
      expect(
        channel.sql
          .exec(
            `SELECT state FROM channel_delivery_mailbox WHERE event_id = ?`,
            event.messageId,
          )
          .toArray(),
      ).toEqual([{ state: "terminal-completed" }]);
      const next = await channel.instance.prepareDurableWorkRelease("delivery");
      await expect(
        channel.instance.waitDurableWorkRelease("delivery", next.barrier),
      ).resolves.toBeUndefined();
      await expect(
        channel.instance.prepareDurableWorkRelease("owner"),
      ).resolves.toMatchObject({ queues: ["channel-observation"] });
    } finally {
      controller.abort(original);
      release.resolve();
      await Promise.allSettled([waiting]);
      observers.add = add;
      await owner.publicationQueue.drain();
    }
  });

  it("cancels a delivery horizon waiter without deleting the held mailbox debt", async () => {
    const channel = await createGadBackedChannel();
    await joinResidentSession(
      channel.instance,
      "do:vibestudio/internal:EvalDO:cancel-delivery",
    );
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    await channel.instance.publish("panel:user", "cancel.owed", { value: 1 });
    const workerId = "driver-cancel-delivery";
    const [claim] = channel.instance.claimReadyWork("channel-delivery", {
      workerId,
      now: Date.now(),
      limit: 1,
    });
    const capture =
      await channel.instance.prepareDurableWorkRelease("delivery");
    const controller = new AbortController();
    const entered = deferred<void>();
    const owner = channel.instance as unknown as {
      waitDeliveryThrough(sequence: number): Promise<void>;
      deliveryWaiters: Set<unknown>;
      _invocationContext: { run<T>(context: unknown, operation: () => T): T };
    };
    const wait = owner.waitDeliveryThrough.bind(channel.instance);
    owner.waitDeliveryThrough = (sequence) => {
      const pending = wait(sequence);
      entered.resolve();
      return pending;
    };
    const original = new Error("caller cancelled delivery closure");
    const waiting = owner._invocationContext.run(
      {
        authorityActive: true,
        requestSignal: controller.signal,
        requestId: "cancel-delivery-closure",
        callerId: "main",
        callerKind: "server",
      },
      () =>
        channel.instance.waitDurableWorkRelease("delivery", capture.barrier),
    );
    try {
      await entered.promise;
      controller.abort(original);
      await expect(waiting).rejects.toBe(original);
      expect(owner.deliveryWaiters.size).toBe(0);
      expect(
        channel.sql
          .exec(
            `SELECT state FROM channel_delivery_mailbox WHERE delivery_id = ?`,
            claim!.itemId,
          )
          .toArray(),
      ).toEqual([{ state: "leased" }]);
      expect(
        channel.instance.settleReadyWork("channel-delivery", {
          workerId,
          itemId: claim!.itemId,
          generation: claim!.generation,
          outcome: { deliveryId: claim!.itemId, disposition: "processed" },
        }),
      ).toBe("accepted");
      await expect(
        channel.instance.waitDurableWorkRelease("delivery", capture.barrier),
      ).resolves.toBeUndefined();
    } finally {
      controller.abort(original);
      await Promise.allSettled([waiting]);
      owner.waitDeliveryThrough = wait;
    }
  });

  it("adopts delivery work from canonical local history without a global read", async () => {
    const methods: string[] = [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (_target, method) => {
        methods.push(method);
        return undefined;
      },
    });
    await instance.adoptDurableWorkWorker("driver-after-restart");
    expect(methods).not.toContain("readLog");
    expect(methods).not.toContain("appendLogEvent");
  });

  it.each(["headless", "agent"] as const)(
    "retains the %s channel role independently of its verified DO principal",
    async (type) => {
      const { instance } = await createGadBackedChannel();
      const senderId = "do:vibestudio/internal:EvalDO:input-client";
      await joinResidentSession(instance, senderId, {
        name: "Programmatic participant",
        type,
      });
      setRpcCaller(instance, senderId, "do");
      await instance.publish(
        senderId,
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
        {
          idempotencyKey: "principal-role-input",
        },
      );
      const completed = canonicalAgenticEvents(instance).find(
        (event) => event.kind === "message.completed",
      )!;
      expect(completed.actor).toMatchObject({
        id: senderId,
        participantId: senderId,
        kind: type === "headless" ? "external" : "agent",
        metadata: { type },
      });
      const selfId = "do:workers/agent-worker:AiChatWorker:responder";
      expect(
        resolveShouldRespond({
          event: {
            senderParticipantId: senderId,
            senderKind: completed.actor.kind,
          },
          self: { participantId: selfId },
          participantIds: [senderId, selfId],
          lastCompletedSender: null,
          policy: "mentioned",
          conversationPolicy: "directed",
        }).respond,
      ).toBe(type === "headless");
    },
  );

  it("declares website eligibility only for the bounded conversation boundary", async () => {
    const { instance } = await createTestDO(PubSubChannel, {
      __objectKey: "website-chat",
    });
    for (const method of [
      "subscribe",
      "sendAsCaller",
      "getReplayAfter",
      "getChannelPresence",
      "callMethod",
    ]) {
      const authority = rpcMethodAuthority(instance, method);
      expect(authority?.website).toMatchObject({ kind: "eligible" });
      expect(authority?.principals).toContain("website");
    }
    for (const method of ["adminUnsubscribeParticipant", "recordReceipt"]) {
      expect(rpcMethodAuthority(instance, method)?.website).toMatchObject({
        kind: "closed",
      });
    }
  });
  it("projects a DO-to-DO work-ready edge into the next host alarm", async () => {
    const { instance, sql } = await createGadBackedChannel();
    const edgeAt = Date.now();
    sql.exec(
      `INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)`,
      "durable-work-ready-generation:channel-delivery",
      "1",
    );

    const schedule = (
      instance as unknown as {
        nextAlarmAfterRequest(): { wakeAt: number } | null;
      }
    ).nextAlarmAfterRequest();

    expect(schedule).not.toBeNull();
    expect(schedule!.wakeAt).toBeGreaterThanOrEqual(edgeAt + 90);
    expect(schedule!.wakeAt).toBeLessThanOrEqual(Date.now() + 250);
  });

  it("ledger:channel.locked.exact-admission", async () => {
    const workerId = "do:workers/system-agent:SystemAgentWorker:user-alice";
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (target === workerId && method === "onChannelEnvelope") return null;
        return undefined;
      },
    });
    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.initializeLockedChannel("ctx-system-alice", {
        title: "System Agent",
        policies: ["agentic.conversation.v1"],
        membershipPolicy: {
          kind: "locked",
          participants: [workerId, "user:alice"],
        },
      }),
    ).resolves.toMatchObject({
      membershipPolicy: {
        kind: "locked",
        participants: [workerId, "user:alice"].sort(),
      },
    });

    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "alice");
    await expect(
      instance.subscribe("client-asserted-id-is-ignored", {
        contextId: "ctx-system-alice",
        name: "Alice",
        type: "panel",
      }),
    ).resolves.toMatchObject({ participantId: "user:alice" });

    setRpcCaller(instance, "panel:bob", "panel", "panel:bob", "bob");
    await expect(
      instance.subscribe("anything", {
        contextId: "ctx-system-alice",
        name: "Bob",
        type: "panel",
      }),
    ).rejects.toThrow(
      "Participant user:bob is not admitted by this locked channel",
    );

    await expect(
      joinEntity(
        instance,
        workerId,
        { name: "System Agent", type: "agent" },
        "ctx-system-alice",
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses a guest publish into a locked channel as closed, not as an unknown participant", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "server:test", "server");
    await instance.initializeLockedChannel("ctx-sealed", {
      membershipPolicy: { kind: "locked", participants: ["user:alice"] },
    });

    // A guest envelope (messaging plan §4.6) is an ordinary publish by a
    // participant who never joined. It must run the same admission check a join
    // would rather than slipping past it.
    setRpcCaller(instance, "do:outsider", "do");
    const refusal = instance.publish(
      "do:outsider",
      AGENTIC_EVENT_PAYLOAD_KIND,
      {
        kind: "message.completed",
        actor: { kind: "agent", id: "do:outsider" },
        causality: { messageId: "msg-guest" },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          role: "assistant",
          outcome: "completed",
        },
        createdAt: "2026-05-20T12:00:00.000Z",
      },
    );

    // The distinction is load-bearing (D14): an agent that reads "unknown
    // addressee" retries forever, and one that reads "closed channel" stops.
    await expect(refusal).rejects.toMatchObject({ code: "ClosedChannel" });
    await expect(refusal).rejects.toThrow(/locked membership/iu);
    await expect(refusal).rejects.toThrow(/does not admit do:outsider/iu);
  });

  it("does not let subscribe or generic config updates create or widen locked membership", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "alice");
    await expect(
      instance.subscribe("ignored", {
        contextId: "ctx-private",
        name: "Alice",
        type: "panel",
        channelConfig: {
          membershipPolicy: { kind: "locked", participants: ["user:alice"] },
        },
      }),
    ).rejects.toThrow(
      "locked channel membership can only be initialized by the host",
    );

    setRpcCaller(instance, "server:test", "server");
    await instance.initializeLockedChannel("ctx-private", {
      membershipPolicy: { kind: "locked", participants: ["user:alice"] },
    });
    await expect(
      instance.updateConfig({
        membershipPolicy: {
          kind: "locked",
          participants: ["user:alice", "user:bob"],
        },
      }),
    ).rejects.toThrow("locked membership is immutable");
    await expect(
      instance.initializeLockedChannel("ctx-private", {
        membershipPolicy: { kind: "locked", participants: ["user:alice"] },
      }),
    ).resolves.toMatchObject({
      membershipPolicy: { kind: "locked", participants: ["user:alice"] },
    });
    await expect(
      instance.initializeLockedChannel("ctx-private", {
        membershipPolicy: {
          kind: "locked",
          participants: ["user:alice", "user:bob"],
        },
      }),
    ).rejects.toThrow("existing channel definition does not match");
  });

  it("terminates a subscription instead of buffering an unread live tail without bound", async () => {
    const { instance } = await createGadBackedChannel();
    const internal = instance as unknown as {
      openSubscriptionResponse(
        participantId: string,
        deliveryId: string,
        replaceParticipant: boolean,
        result: never,
      ): Response;
      deliverParticipantPayload(
        participantId: string,
        payload: unknown,
      ): Promise<void>;
      participantSubscriptionCount(participantId: string): number;
    };
    const response = internal.openSubscriptionResponse(
      "panel:slow",
      "delivery:slow",
      false,
      {
        ok: true,
        participantId: "panel:slow",
      } as never,
    );

    for (let index = 0; index < 80; index += 1) {
      await internal.deliverParticipantPayload("panel:slow", {
        index,
        content: "x".repeat(16_000),
      });
    }

    expect(internal.participantSubscriptionCount("panel:slow")).toBe(0);
    await expect(response.body!.getReader().read()).rejects.toThrow(
      /response-buffer-full/,
    );
  });

  it("stores durable publishes with canonical event kind and payload headers", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    const result = await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
      {
        idempotencyKey: "publish-1",
      },
    );

    expect(result.id).toBe(2);
    const rows = canonicalLedger(instance).read({ limit: 100 });
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toMatchObject({
      seq: 2,
      payloadKind: "message.completed",
    });
    expect(rows[1]!.payload).toMatchObject({
      protocol: AGENTIC_PROTOCOL_VERSION,
      role: "user",
    });
    expect(rows[1]!.annotations).toMatchObject({
      metadata: { name: "User" },
    });
  });

  it("ledger:channel.ordinary.authenticated-admission", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:nav-current", "panel", "panel:slot-stable");

    await expect(
      instance.subscribe("panel:slot-stable", {
        contextId: "ctx-1",
        name: "User",
        type: "panel",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      instance.publish(
        "panel:slot-stable",
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
      ),
    ).resolves.toMatchObject({ id: expect.any(Number) });
    await expect(
      instance.publish(
        "panel:other",
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
      ),
    ).rejects.toThrow(
      "publish: participant panel:other cannot be used by caller panel:nav-current",
    );
  });

  it("admits human participant operations without admitting provider settlement", async () => {
    const { instance, callAs } = await createGadBackedChannel();
    setRpcCaller(instance, "shell:alice", "shell", null, "usr_alice");
    await instance.subscribe("shell:alice", {
      contextId: "ctx-1",
      name: "Alice",
      type: "client",
    });

    await expect(
      callAs(
        {
          callerId: "shell:alice",
          callerKind: "shell",
          userId: "usr_alice",
        },
        "publish",
        "user:usr_alice",
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
      ),
    ).resolves.toMatchObject({ id: expect.any(Number) });
    const published = await instance.getReplayAfter({ after: 0 });
    expect(published.logEvents.at(-1)).toMatchObject({
      senderId: "user:usr_alice",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
    });
    setRpcCaller(instance, "shell:bob", "shell", null, "usr_bob");
    await expect(
      instance.publish(
        "user:usr_alice",
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
      ),
    ).rejects.toThrow(
      /participant user:usr_alice cannot be used by caller shell:bob/u,
    );
    const userContext = structuredClone(
      createTestDirectAuthority({ callerKind: "agent", method: "publish" })
        .context,
    );
    userContext.authorizingOrigin = {
      kind: "user",
      principal: "user:usr_alice",
    };
    userContext.actingUser = "user:usr_alice";
    userContext.executingCode = null;
    userContext.initiatorChain = ["user:usr_alice"];

    const decisionFor = (method: string) => {
      const declaration = rpcMethodAuthority(instance, method)!;
      expect(declaration.principals).toBeDefined();
      return evaluateAuthority({
        context: userContext,
        requirement: requirementForPrincipals(
          declaration.principals!,
          `rpc:${method}`,
        ),
        resourceKey: "do:workers/pubsub-channel:PubSubChannel:channel-1",
        grants: [],
        tier: declaration.tier,
      });
    };
    for (const method of [
      "publish",
      "sendSignal",
      "updateMetadata",
      "setTypingState",
      "callMethod",
    ]) {
      expect(rpcMethodAuthority(instance, method)?.principals).toEqual([
        "user",
        "code",
        "website",
      ]);
      expect(decisionFor(method)).toMatchObject({
        allowed: true,
        code: "allowed",
      });
    }
    expect(rpcMethodAuthority(instance, "recordReceipt")?.principals).toEqual([
      "user",
      "code",
    ]);
    expect(decisionFor("recordReceipt")).toMatchObject({
      allowed: true,
      code: "allowed",
    });
    expect(rpcMethodAuthority(instance, "getReplayBefore")?.principals).toEqual(
      ["host", "user", "code", "website"],
    );
    expect(decisionFor("getReplayBefore")).toMatchObject({
      allowed: true,
      code: "allowed",
    });
    for (const method of [
      "submitMethodResult",
      "submitMethodProgress",
      "claimMethodCall",
      "markMethodCallExecutionStarted",
    ]) {
      expect(rpcMethodAuthority(instance, method)?.principals).toEqual([
        "code",
      ]);
      expect(decisionFor(method)).toMatchObject({
        allowed: false,
        code: "receiver-rejected",
      });
    }
  });

  it("does not let agent callers inject arbitrary roster participants", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });

    setRpcCaller(instance, "agent:session-1", "agent");
    await expect(
      instance.subscribe("panel:phantom", {
        contextId: "ctx-1",
        name: "Fake",
        type: "agent",
      }),
    ).rejects.toThrow(
      "Participant panel:phantom cannot be subscribed by caller agent:session-1",
    );
    await expect(
      instance.subscribe("agent:session-1", {
        contextId: "ctx-1",
        name: "Agent",
        type: "agent",
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("does not let shell callers inject arbitrary roster participants", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "shell:dev-1", "shell");

    await expect(
      instance.subscribe("cli-shadow", {
        contextId: "ctx-1",
        name: "CLI",
        type: "client",
      }),
    ).rejects.toThrow(
      "Participant cli-shadow cannot be subscribed by caller shell:dev-1",
    );
    await expect(
      instance.subscribe("shell:dev-1", {
        contextId: "ctx-1",
        name: "CLI",
        type: "client",
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("ledger:channel.presence.canonical-human", async () => {
    const emittedTargets: string[] = [];
    const { instance, sql } = await createGadBackedChannel({ emittedTargets });

    setRpcCaller(instance, "panel:nav-a", "panel", "panel:slot-a", "usr_alice");
    const first = (await instance.subscribe("panel:slot-a", {
      contextId: "ctx-1",
      name: "Chat panel A",
      type: "panel",
    })) as unknown as { participantId: string };
    setRpcCaller(instance, "panel:nav-b", "panel", "panel:slot-b", "usr_alice");
    const second = (await instance.subscribe("panel:slot-b", {
      contextId: "ctx-1",
      name: "Chat panel B",
      type: "panel",
    })) as unknown as { participantId: string };

    expect(first.participantId).toBe("user:usr_alice");
    expect(second.participantId).toBe("user:usr_alice");
    expect(sql.exec(`SELECT id FROM participants`).toArray()).toEqual([
      { id: "user:usr_alice" },
    ]);
    await expect(instance.getChannelPresence()).resolves.toMatchObject({
      entries: [{ participantId: "user:usr_alice", sessionCount: 2 }],
    });

    emittedTargets.length = 0;
    await instance.publish(
      "user:usr_alice",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
      {
        idempotencyKey: "human-publish",
      },
    );
    await Promise.resolve();
    expect(new Set(emittedTargets)).toEqual(
      new Set(["panel:slot-a", "panel:slot-b"]),
    );

    // Cooperative unsubscribe has the same delivery-local ownership as body
    // cancellation. Closing one UI must not retire another UI's response or
    // end their shared human relationship.
    setRpcCaller(instance, "panel:nav-b", "panel", "panel:slot-b", "usr_alice");
    await expect(
      instance.unsubscribe("user:usr_alice", "panel:slot-a"),
    ).rejects.toThrow(/owned by another delivery/u);
    await expect(instance.getChannelPresence()).resolves.toMatchObject({
      entries: [{ participantId: "user:usr_alice", sessionCount: 2 }],
    });
    await instance.unsubscribe("user:usr_alice");
    expect(sql.exec(`SELECT id FROM participants`).toArray()).toHaveLength(1);
    await expect(instance.getChannelPresence()).resolves.toMatchObject({
      entries: [{ participantId: "user:usr_alice", sessionCount: 1 }],
    });

    emittedTargets.length = 0;
    await instance.publish(
      "user:usr_alice",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
      {
        idempotencyKey: "human-publish-after-one-close",
      },
    );
    await Promise.resolve();
    // The remaining delivery receives one canonically retained live envelope.
    expect(emittedTargets).toEqual(["panel:slot-a"]);

    await closeTestSubscription(instance, "user:usr_alice", "panel:slot-a");
    expect(sql.exec(`SELECT id FROM participants`).toArray()).toHaveLength(0);
    // Repeating response cancellation remains a successful no-op.
    await closeTestSubscription(instance, "user:usr_alice", "panel:slot-a");
    await expect(instance.getChannelPresence()).resolves.toMatchObject({
      entries: [
        {
          participantId: "user:usr_alice",
          userId: "usr_alice",
          status: "offline",
          sessionCount: 0,
          lastSeenAt: expect.any(Number),
        },
      ],
    });
  });

  it("does not let a superseded client's late unsubscribe close its replacement", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "app:apps/shell:main", "app", null, "usr_alice");
    const metadata = {
      contextId: "ctx-1",
      name: "Shell",
      type: "client",
    };

    await instance.subscribe("app:apps/shell:main", metadata, "quickfire-old");
    await instance.subscribe("app:apps/shell:main", metadata, "quickfire-new");
    await instance.unsubscribe("user:usr_alice", "quickfire-old");

    await expect(instance.getChannelPresence()).resolves.toMatchObject({
      entries: [{ participantId: "user:usr_alice", sessionCount: 1 }],
    });
    await closeTestSubscription(instance, "user:usr_alice", "quickfire-new");
  });

  it("uses authenticated delivery identity without a client session namespace", async () => {
    const { instance, sql } = await createGadBackedChannel();
    setRpcCaller(
      instance,
      "panel:alice-nav",
      "panel",
      "panel:shared-slot",
      "usr_alice",
    );
    await instance.subscribe("panel:shared-slot", {
      contextId: "ctx-1",
      name: "Alice",
      type: "panel",
    });

    // The host owns endpoint/account integrity. The channel keeps no parallel
    // client-asserted session namespace or uniqueness authority.
    setRpcCaller(
      instance,
      "panel:bob-nav",
      "panel",
      "panel:shared-slot",
      "usr_bob",
    );
    await instance.subscribe("panel:shared-slot", {
      contextId: "ctx-1",
      name: "Bob",
      type: "panel",
    });

    expect(
      sql.exec(`SELECT id FROM participants ORDER BY id`).toArray(),
    ).toEqual([{ id: "user:usr_alice" }, { id: "user:usr_bob" }]);
  });

  it("derives online, idle, away, and offline from domain activity", async () => {
    const { instance, sql } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");
    await instance.subscribe("panel:alice", {
      contextId: "ctx-1",
      name: "Alice panel",
      type: "panel",
    });
    const internal = instance as unknown as { advancePresenceStatuses(): void };
    const now = Date.now();

    sql.exec(
      `UPDATE participants SET last_active_at = ?, presence_status = 'online' WHERE id = ?`,
      now - 6 * 60_000,
      "user:usr_alice",
    );
    internal.advancePresenceStatuses();
    expect((await instance.getChannelPresence()).entries[0]?.status).toBe(
      "idle",
    );

    sql.exec(
      `UPDATE participants SET last_active_at = ?, presence_status = 'idle' WHERE id = ?`,
      now - 31 * 60_000,
      "user:usr_alice",
    );
    internal.advancePresenceStatuses();
    expect((await instance.getChannelPresence()).entries[0]?.status).toBe(
      "away",
    );

    await instance.setTypingState("user:usr_alice", true);
    expect((await instance.getChannelPresence()).entries[0]?.status).toBe(
      "online",
    );
  });

  it("ledger:channel.invitation.discovery-metadata", async () => {
    const { instance, gad } = await createGadBackedChannel({
      rpcCall: (_target, method, args) => {
        if (method === "account.isMember") return args[0] === "usr_bob";
        if (method === "account.resolveProfiles") {
          return { usr_bob: profileFixture("usr_bob") };
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");
    await instance.subscribe("panel:alice", {
      contextId: "ctx-1",
      name: "Alice",
      type: "panel",
    });
    const before = gad.sql
      .exec(`SELECT COUNT(*) AS count FROM log_events`)
      .one()["count"];
    await expect(
      instance.addMember({ userId: "usr_bob" }),
    ).resolves.toMatchObject({
      userId: "usr_bob",
      memberId: "user:usr_bob",
      handle: "bob",
      alreadyMember: false,
    });
    expect(
      gad.sql
        .exec(
          `SELECT user_id, notification_id, kind FROM user_notifications WHERE user_id = ?`,
          "usr_bob",
        )
        .toArray(),
    ).toEqual([
      {
        user_id: "usr_bob",
        notification_id: "channel.invite:channel-1",
        kind: "channel.invite",
      },
    ]);
    const after = gad.sql
      .exec(`SELECT COUNT(*) AS count FROM log_events`)
      .one()["count"];
    expect(after).toBe(before);

    setRpcCaller(instance, "panel:bob", "panel", "panel:bob", "usr_bob");
    await expect(instance.listInvitesForMe()).resolves.toMatchObject({
      invites: [{ channelId: "channel-1", memberId: "user:usr_bob" }],
    });
    await expect(instance.acknowledgeInvite()).resolves.toEqual({
      acknowledged: true,
    });
    await expect(instance.acknowledgeInvite()).resolves.toEqual({
      acknowledged: false,
    });
    await expect(instance.listInvitesForMe()).resolves.toEqual({ invites: [] });

    // Re-adding an existing member refreshes profile data but does not invent a
    // second pending invitation after the first was acknowledged.
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");
    await expect(
      instance.addMember({ userId: "usr_bob" }),
    ).resolves.toMatchObject({
      alreadyMember: true,
    });
    setRpcCaller(instance, "panel:bob", "panel", "panel:bob", "usr_bob");
    await expect(instance.listInvitesForMe()).resolves.toEqual({ invites: [] });

    // Remove and a subsequent fresh add both converge the workspace index.
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");
    await expect(instance.removeMember({ userId: "usr_bob" })).resolves.toEqual(
      { removed: true },
    );
    await expect(
      instance.addMember({ userId: "usr_bob" }),
    ).resolves.toMatchObject({
      alreadyMember: false,
    });
    expect(
      gad.sql.exec(`SELECT COUNT(*) AS count FROM user_notifications`).one()[
        "count"
      ],
    ).toBe(1);
    await expect(instance.removeMember({ userId: "usr_bob" })).resolves.toEqual(
      { removed: true },
    );
    expect(
      gad.sql.exec(`SELECT COUNT(*) AS count FROM user_notifications`).one()[
        "count"
      ],
    ).toBe(0);

    await expect(instance.addMember({ userId: "usr_outside" })).rejects.toThrow(
      /not a member of this workspace/,
    );
    await expect(
      instance.addMember({ userId: "user:usr_bob" }),
    ).rejects.toThrow(/bare workspace account id/);
  });

  it("retries a lost workspace invite-index write through a host-held claim", async () => {
    let failFirstPut = true;
    const { instance, sql, gad } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (method === "account.isMember") return args[0] === "usr_bob";
        if (method === "account.resolveProfiles")
          return { usr_bob: profileFixture("usr_bob") };
        if (
          target.includes("GadWorkspaceDO") &&
          method === "putChannelMembership" &&
          failFirstPut
        ) {
          failFirstPut = false;
          throw new Error("simulated lost GAD response");
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");

    await expect(instance.addMember({ userId: "usr_bob" })).rejects.toThrow(
      /invitation delivery is pending/,
    );
    expect(
      sql.exec(`SELECT COUNT(*) AS count FROM invite_index_ops`).one()["count"],
    ).toBe(1);
    expect(
      gad.sql.exec(`SELECT COUNT(*) AS count FROM user_notifications`).one()[
        "count"
      ],
    ).toBe(0);

    sql.exec(`UPDATE invite_index_ops SET updated_at = 0`);
    await instance.alarm();
    const [claim] = instance.claimReadyWork("channel-delivery", {
      workerId: "test-host",
      now: Date.now(),
      limit: 1,
    });
    expect(claim?.itemId).toContain("maintenance:invite-index:");
    const outcome = await instance.executeChannelMaintenanceClaim({
      itemId: claim!.itemId,
      generation: claim!.generation,
    });
    expect(
      instance.settleReadyWork("channel-delivery", {
        workerId: "test-host",
        itemId: claim!.itemId,
        generation: claim!.generation,
        outcome,
      }),
    ).toBe("accepted");

    expect(
      sql.exec(`SELECT COUNT(*) AS count FROM invite_index_ops`).one()["count"],
    ).toBe(0);
    expect(
      gad.sql.exec(`SELECT COUNT(*) AS count FROM user_notifications`).one()[
        "count"
      ],
    ).toBe(1);
  });

  it("turns a pending invite put into cleanup when workspace membership was revoked", async () => {
    let isWorkspaceMember = true;
    let putAttempts = 0;
    let deleteAttempts = 0;
    const { instance, sql, gad } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (method === "account.isMember")
          return isWorkspaceMember && args[0] === "usr_bob";
        if (method === "account.resolveProfiles")
          return { usr_bob: profileFixture("usr_bob") };
        if (
          target.includes("GadWorkspaceDO") &&
          method === "putChannelMembership"
        ) {
          putAttempts += 1;
          throw new Error("simulated unavailable invite index");
        }
        if (
          target.includes("GadWorkspaceDO") &&
          method === "deleteChannelMembership"
        ) {
          deleteAttempts += 1;
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");

    await expect(instance.addMember({ userId: "usr_bob" })).rejects.toThrow(
      /invitation delivery is pending/,
    );
    expect(putAttempts).toBe(1);
    expect(
      sql.exec(`SELECT COUNT(*) AS count FROM channel_members`).one()["count"],
    ).toBe(1);

    isWorkspaceMember = false;
    await expect(instance.removeMember({ userId: "usr_bob" })).resolves.toEqual(
      {
        removed: true,
      },
    );

    expect(putAttempts).toBe(1);
    expect(deleteAttempts).toBe(1);
    expect(
      sql.exec(`SELECT COUNT(*) AS count FROM channel_members`).one()["count"],
    ).toBe(0);
    expect(
      sql.exec(`SELECT COUNT(*) AS count FROM invite_index_ops`).one()["count"],
    ).toBe(0);
    expect(
      gad.sql.exec(`SELECT COUNT(*) AS count FROM user_notifications`).one()[
        "count"
      ],
    ).toBe(0);
    await expect(instance.listMembers()).resolves.toEqual({ members: [] });
  });

  it("keeps remove as the final projection when an older add completes last", async () => {
    const putStarted = deferred<void>();
    const releasePut = deferred<void>();
    let holdFirstPut = true;
    const { instance, gad } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (method === "account.isMember") return args[0] === "usr_bob";
        if (method === "account.resolveProfiles")
          return { usr_bob: profileFixture("usr_bob") };
        if (
          target.includes("GadWorkspaceDO") &&
          method === "putChannelMembership" &&
          holdFirstPut
        ) {
          holdFirstPut = false;
          putStarted.resolve(undefined);
          await releasePut.promise;
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");

    const add = instance.addMember({ userId: "usr_bob" });
    await putStarted.promise;
    await expect(instance.removeMember({ userId: "usr_bob" })).resolves.toEqual(
      { removed: true },
    );
    releasePut.resolve(undefined);
    await expect(add).resolves.toMatchObject({ memberId: "user:usr_bob" });

    expect(
      gad.sql
        .exec(
          `SELECT action, revision FROM channel_membership_revisions
            WHERE user_id = 'usr_bob' AND channel_id = 'channel-1'`,
        )
        .toArray(),
    ).toEqual([{ action: "delete", revision: 2 }]);
    expect(
      gad.sql
        .exec(
          `SELECT 1 FROM channel_membership_index
            WHERE user_id = 'usr_bob' AND channel_id = 'channel-1'`,
        )
        .toArray(),
    ).toEqual([]);
    expect(gad.sql.exec(`SELECT * FROM user_notifications`).toArray()).toEqual(
      [],
    );
  });

  it("keeps add as the final projection when an older remove completes last", async () => {
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    let holdDelete = false;
    const { instance, gad } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (method === "account.isMember") return args[0] === "usr_bob";
        if (method === "account.resolveProfiles")
          return { usr_bob: profileFixture("usr_bob") };
        if (
          target.includes("GadWorkspaceDO") &&
          method === "deleteChannelMembership" &&
          holdDelete
        ) {
          holdDelete = false;
          deleteStarted.resolve(undefined);
          await releaseDelete.promise;
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:alice", "panel", "panel:alice", "usr_alice");
    await instance.addMember({ userId: "usr_bob" });

    holdDelete = true;
    const remove = instance.removeMember({ userId: "usr_bob" });
    await deleteStarted.promise;
    await expect(
      instance.addMember({ userId: "usr_bob" }),
    ).resolves.toMatchObject({
      alreadyMember: false,
    });
    releaseDelete.resolve(undefined);
    await expect(remove).resolves.toEqual({ removed: true });

    expect(
      gad.sql
        .exec(
          `SELECT action, revision FROM channel_membership_revisions
            WHERE user_id = 'usr_bob' AND channel_id = 'channel-1'`,
        )
        .toArray(),
    ).toEqual([{ action: "put", revision: 3 }]);
    expect(
      gad.sql
        .exec(
          `SELECT member_id FROM channel_membership_index
            WHERE user_id = 'usr_bob' AND channel_id = 'channel-1'`,
        )
        .toArray(),
    ).toEqual([{ member_id: "user:usr_bob" }]);
    expect(
      gad.sql
        .exec(
          `SELECT notification_id FROM user_notifications
            WHERE user_id = 'usr_bob' AND notification_id = 'channel.invite:channel-1'`,
        )
        .toArray(),
    ).toEqual([{ notification_id: "channel.invite:channel-1" }]);
  });

  it("sendAsCaller ignores an agent-supplied display handle", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "agent:session-1", "agent");
    const caller = (
      instance as unknown as {
        _currentVerifiedCaller: {
          authorization?: ReturnType<typeof createTestDirectAuthority>;
        };
      }
    )._currentVerifiedCaller;
    caller.authorization = createTestDirectAuthority({
      callerKind: "agent",
      method: "sendAsCaller",
    });

    await instance.sendAsCaller("hello", { handle: "Alice" });

    const annotations = canonicalLedger(instance)
      .read({ limit: 100 })
      .filter((event) => event.payloadKind === "message.completed")
      .at(-1)!.annotations as Record<string, unknown>;
    expect(annotations["metadata"]).toMatchObject({
      name: "agent:session-1",
      handle: "agent:session-1",
      kind: "agent",
    });
  });

  it("rejects arbitrary participant labels for durable-object callers", async () => {
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });
    const evalDoId = "do:vibestudio/internal:EvalDO:eval-1";
    const arbitraryLabel = "headless-diagnose-123";
    setRpcCaller(instance, evalDoId, "durable-object");

    await expect(
      instance.join({
        participantId: arbitraryLabel,
        operationId: "join-1",
        contextId: "ctx-1",
        metadata: { name: "Eval client", type: "client" },
        delivery: "all",
        endpoint: { kind: "entity", entityId: evalDoId, invocation: "mailbox" },
        applicationConfig: null,
        replay: true,
      }),
    ).rejects.toThrow(
      `join: participant ${arbitraryLabel} cannot be used by caller ${evalDoId}`,
    );
    await expect(
      instance.publish(
        arbitraryLabel,
        AGENTIC_EVENT_PAYLOAD_KIND,
        agenticEvent(),
      ),
    ).rejects.toThrow(
      `publish: participant ${arbitraryLabel} cannot be used by caller ${evalDoId}`,
    );

    await expect(
      joinResidentSession(instance, evalDoId, {
        name: "Eval client",
        type: "client",
      }),
    ).resolves.toBeUndefined();
  });

  it("establishes exact admitted self-membership without another entity lookup", async () => {
    const participantId = "do:vibestudio/internal:EvalDO:admitted-eval";
    const lookups: unknown[][] = [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          lookups.push(args);
          throw new Error(
            "Self-membership must use its existing ingress admission",
          );
        }
        return undefined;
      },
    });
    setRpcCaller(instance, participantId, "do");
    const input = {
      participantId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Admitted eval", type: "headless" },
      delivery: "all" as const,
      endpoint: {
        kind: "entity" as const,
        entityId: participantId,
        invocation: "direct" as const,
      },
      applicationConfig: null,
      replay: true,
    };
    const first = await instance.join(input);
    expect(first).toMatchObject({ ok: true, participantId, revision: 1 });
    const retry = await instance.join(input);
    expect(retry).toMatchObject({ participantId, revision: first.revision });
    expect(retry.envelope?.logEvents).toEqual(first.envelope?.logEvents);
    expect(retry.envelope?.ready.snapshotLastSeq).toBe(
      first.envelope?.ready.snapshotLastSeq,
    );
    expect(lookups).toEqual([]);
    await expect(
      instance.join({
        ...input,
        endpoint: {
          ...input.endpoint,
          entityId: "do:vibestudio/internal:EvalDO:other",
        },
      }),
    ).rejects.toThrow(
      "delivery endpoint must be owned by the stable participant entity",
    );
  });

  it("closes its owned join once and never closes a concurrently replaced membership", async () => {
    const { instance } = await createGadBackedChannel();
    const participantId = "do:vibestudio/internal:EvalDO:finite-owner";
    setRpcCaller(instance, participantId, "do");
    const input = {
      participantId,
      operationId: "opening-1",
      contextId: "ctx-1",
      metadata: { type: "headless" },
      delivery: "all" as const,
      endpoint: {
        kind: "entity" as const,
        entityId: participantId,
        invocation: "mailbox" as const,
      },
      applicationConfig: null,
      replay: false,
    };
    const original = await instance.join(input);
    const replacement = await instance.join({
      ...input,
      operationId: "opening-2",
    });
    await instance.leave({ participantId, revision: original.revision });
    expect(await instance.relationshipState(participantId)).toEqual({
      active: true,
      revision: replacement.revision,
    });
    await expect(
      instance.leave({ participantId, revision: replacement.revision + 1 }),
    ).rejects.toThrow("join revision was not admitted");
    await Promise.all([
      instance.leave({ participantId, revision: replacement.revision }),
      instance.leave({ participantId, revision: replacement.revision }),
    ]);
    expect(await instance.relationshipState(participantId)).toEqual({
      active: false,
      revision: replacement.revision + 1,
    });
    const reopened = await instance.join({
      ...input,
      operationId: "opening-3",
    });
    await instance.leave({ participantId, revision: replacement.revision });
    expect(await instance.relationshipState(participantId)).toEqual({
      active: true,
      revision: reopened.revision,
    });
  });

  it.each(["direct", "mailbox"] as const)(
    "preserves the %s entity route when participant metadata revises its relationship",
    async (invocation) => {
      const participantId =
        "do:workers/agent-worker:AiChatWorker:metadata-route";
      const { instance, sql } = await createGadBackedChannel();
      setRpcCaller(instance, participantId, "do");
      await instance.join({
        participantId,
        operationId: "join-metadata-route",
        contextId: "ctx-1",
        metadata: { name: "Before", type: "agent" },
        delivery: "all",
        endpoint: { kind: "entity", entityId: participantId, invocation },
        applicationConfig: null,
        replay: false,
      });

      await instance.adminUpdateParticipantMetadata(participantId, {
        name: "After",
        type: "agent",
      });

      expect(
        sql
          .exec(
            `SELECT revision, endpoint_kind, endpoint_entity_id, invocation_route,
                    metadata_json
               FROM channel_relationships WHERE participant_id = ?`,
            participantId,
          )
          .toArray()[0],
      ).toEqual({
        revision: 2,
        endpoint_kind: "entity",
        endpoint_entity_id: participantId,
        invocation_route: invocation,
        metadata_json: JSON.stringify({ name: "After", type: "agent" }),
      });

      await instance.leave({ participantId, revision: 2 });
      expect(await instance.relationshipState(participantId)).toEqual({
        active: false,
        revision: 3,
      });
    },
  );

  it("dedupes concurrent publishes with the same idempotency key before append settles", async () => {
    const appendEntered = deferred();
    const releaseAppend = deferred();
    let appendCalls = 0;
    let blockAppend = false;
    const { instance } = await createGadBackedChannel();
    const log = (instance as unknown as { channelLog: ChannelLog }).channelLog;
    const append = log.append.bind(log);
    log.append = async (input) => {
      if (blockAppend) {
        appendCalls += 1;
        appendEntered.resolve();
        await releaseAppend.promise;
      }
      return append(input);
    };
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    blockAppend = true;

    const originalPayload = agenticEvent();
    const first = instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      originalPayload,
      {
        idempotencyKey: "initial-prompt:chat-race",
      },
    );
    await appendEntered.promise;
    const second = instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
      {
        idempotencyKey: "initial-prompt:chat-race",
      },
    );
    await Promise.resolve();

    expect(appendCalls).toBe(1);
    releaseAppend.resolve();
    const receipts = await Promise.all([first, second]);
    expect(receipts[0]).toMatchObject({
      id: 2,
      senderId: "panel:user",
      payload: {
        ...originalPayload,
        actor: { kind: "panel", id: "panel:user" },
      },
    });
    expect(receipts[1]).toEqual(receipts[0]);

    expect(canonicalLedger(instance).read({ limit: 100 })).toHaveLength(2);
  });

  it("joins a fresh relationship without retaining an unobserved receiver snapshot or rereading its committed append", async () => {
    const methods: string[] = [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (_target, method) => {
        methods.push(method);
        return undefined;
      },
    });
    await joinEntity(
      instance,
      "do:workers/agent-worker:AiChatWorker:fresh-snapshot",
    );
    expect(methods).not.toContain("blobstore.putText");
    expect(canonicalLedger(instance).headSequence()).toBe(1);
    expect(methods).not.toContain("appendLogEvent");
    expect(methods).not.toContain("readLog");
  });

  it("replays the committed join horizon after a lost response while later events remain live mailbox work", async () => {
    const { instance } = await createGadBackedChannel();
    const participantId = "do:workers/agent-worker:AiChatWorker:bootstrap-test";
    setRpcCaller(instance, participantId, "durable-object");
    const input = {
      participantId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Agent", type: "agent" },
      delivery: "all" as const,
      endpoint: {
        kind: "entity" as const,
        entityId: participantId,
        invocation: "direct" as const,
      },
      applicationConfig: null,
      replay: true,
    };
    const original = await instance.join(input);
    const cutoff = original.envelope!.ready.snapshotLastSeq!;
    await instance.updateConfig({ agentHopLimit: 7 });
    const repeated = await instance.join(input);
    expect(repeated.revision).toBe(original.revision);
    expect(repeated.envelope!.logEvents).toEqual(original.envelope!.logEvents);
    expect(repeated.envelope!.ready.snapshotLastSeq).toBe(cutoff);
    expect(repeated.envelope!.ready.hasMoreAfter).toBe(false);
    expect(
      repeated.envelope!.logEvents.every((event) => event.id <= cutoff),
    ).toBe(true);
    expect(
      canonicalLedger(instance)
        .read({ limit: 100 })
        .filter((event) => event.payloadKind === "channel.subscription.opened"),
    ).toHaveLength(1);
    const deliveries = (
      instance as unknown as {
        sql: {
          exec: (
            sql: string,
            ...args: unknown[]
          ) => { toArray(): Record<string, unknown>[] };
        };
      }
    ).sql
      .exec(
        `SELECT event_sequence FROM channel_delivery_mailbox WHERE participant_id = ? AND event_sequence > ?`,
        participantId,
        cutoff,
      )
      .toArray();
    expect(deliveries.length).toBeGreaterThan(0);
  });

  it("replays an exact operation after a newer relationship without undoing the newer membership", async () => {
    const channel = await createGadBackedChannel();
    const participantId =
      "do:workers/agent-worker:AiChatWorker:ordered-intents";
    setRpcCaller(channel.instance, participantId, "durable-object");
    const first = {
      participantId,
      operationId: "first",
      contextId: "ctx-1",
      metadata: { name: "First", type: "agent" },
      delivery: "all" as const,
      endpoint: {
        kind: "entity" as const,
        entityId: participantId,
        invocation: "direct" as const,
      },
      applicationConfig: null,
      replay: true,
    };
    const original = await channel.instance.join(first);
    const newer = await channel.instance.join({
      ...first,
      operationId: "second",
      metadata: { name: "Second", type: "agent" },
    });
    expect(newer.revision).toBe(original.revision! + 1);
    const reopened = await createGadBackedChannel({
      db: channel.db,
      gad: channel.gad,
    });
    setRpcCaller(reopened.instance, participantId, "durable-object");
    const retry = await reopened.instance.join(first);
    expect(retry.revision).toBe(original.revision);
    expect(retry.envelope!.ready.snapshotLastSeq).toBe(
      original.envelope!.ready.snapshotLastSeq,
    );
    expect(await reopened.instance.relationshipState(participantId)).toEqual({
      revision: newer.revision,
      active: true,
    });
    await expect(
      reopened.instance.join({
        ...first,
        metadata: { name: "Changed", type: "agent" },
      }),
    ).rejects.toThrow("operationId already names different relationship data");
  });

  it("keeps identity summaries compact while retaining exact executable offers at a relationship revision", async () => {
    const { instance, gad } = await createGadBackedChannel();
    const participantId = "do:workers/agent-worker:AiChatWorker:metadata-test";
    const metadata = {
      name: "Agent",
      type: "agent",
      methods: [
        {
          name: "pause",
          description: "private executable description",
          parameters: {
            type: "object",
            properties: { private: { type: "string" } },
          },
          returns: { type: "boolean" },
        },
      ],
    };
    await joinEntity(instance, participantId, metadata);
    await expect(
      joinEntity(instance, participantId, {
        ...metadata,
        methods: [
          {
            ...metadata.methods[0]!,
            description: "changed private description",
          },
        ],
      }),
    ).rejects.toThrow("operationId already names different relationship data");
    const rows = canonicalLedger(instance)
      .read({ limit: 100 })
      .filter(
        (envelope) => envelope.payloadKind === "channel.subscription.opened",
      );
    expect(rows).toHaveLength(1);
    expect((rows[0]!.payload as Record<string, unknown>)["metadata"]).toEqual({
      name: "Agent",
      type: "agent",
      methods: [{ name: "pause" }],
    });
    expect(
      (rows[0]!.payload as Record<string, unknown>)["methodOffers"],
    ).toEqual(metadata.methods);
    const integrity = await gad.call("checkGadIntegrity", {});
    expect(
      integrity.errors.filter((error) => error.type === "log-event-shape"),
    ).toEqual([]);
  });

  it("retains schemas once as method offers without embedding them in participant references", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
      handle: "alice",
      methods: [
        {
          name: "eval",
          description: "x".repeat(4096),
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "y".repeat(4096) },
            },
          },
          returns: { type: "object", description: "z".repeat(4096) },
        },
      ],
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
      {
        idempotencyKey: "publish-with-methods",
      },
    );

    const rows = canonicalLedger(instance).read({ limit: 100 });
    const identityJson = JSON.stringify(
      rows.map((row) => ({
        actor: row.actor,
        annotations: row.annotations,
        metadata: (row.payload as Record<string, unknown>)["metadata"],
      })),
    );
    expect(identityJson).not.toContain("properties");
    expect(identityJson).not.toContain("returns");
    expect(identityJson).not.toContain("description");
    expect(identityJson).not.toContain("yyyy");
    expect(
      (rows[0]!.payload as Record<string, unknown>)["methodOffers"],
    ).toMatchObject([
      {
        name: "eval",
        description: "x".repeat(4096),
        parameters: { properties: { code: { description: "y".repeat(4096) } } },
        returns: { description: "z".repeat(4096) },
      },
    ]);
    expect(rows[0]!.payload).toMatchObject({
      metadata: { methods: [{ name: "eval" }] },
    });
    expect(rows[1]!.annotations).toMatchObject({
      metadata: { methods: [{ name: "eval" }] },
    });
  });

  it("commits owner history and forwards subscribers before global observation, retaining exact mailbox identity", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const receiverRelease = deferred<void>();
    let held = false;
    let channelContext: {
      current():
        | { verifiedCaller?: { authorization?: { nonce?: string } } }
        | undefined;
      run<T>(value: unknown, operation: () => T): T;
    };
    const nonces: unknown[] = [];
    const emitted: unknown[] = [];
    const deliveries: any[] = [];
    const channel = await createGadBackedChannel({
      emitted,
      rpcCall: async (_target, method, args) => {
        if (method === "appendLogEvent" && held) {
          started.resolve(undefined);
          await release.promise;
        }
        if (method === "acceptChannelDelivery") {
          const delivery = args[0] as any;
          deliveries.push(delivery);
          if (delivery.envelope.event.type === "custom.live") {
            nonces.push(
              channelContext.current()?.verifiedCaller?.authorization?.nonce,
            );
            await receiverRelease.promise;
            nonces.push(
              channelContext.current()?.verifiedCaller?.authorization?.nonce,
            );
          }
          return { deliveryId: delivery.deliveryId, disposition: "processed" };
        }
        return undefined;
      },
    });
    channelContext = (
      channel.instance as unknown as {
        _invocationContext: typeof channelContext;
      }
    )._invocationContext;
    await joinEntity(
      channel.instance,
      "do:workers/agent-worker:AiChatWorker:live-recipient",
    );
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    emitted.length = 0;
    deliveries.length = 0;
    held = true;
    const parent = {
      authorityActive: true,
      callerId: "panel:user",
      callerKind: "panel",
      verifiedCaller: {
        callerId: "panel:user",
        callerKind: "panel",
        authorization: { nonce: "publisher:request:nonce" },
      },
      requestId: "publisher:request",
      idempotencyKey: null,
      readyQueues: new Set(),
    };
    const receipt = await channelContext.run(parent, () =>
      channel.instance.publish("panel:user", "custom.live", { value: "go" }),
    );
    parent.authorityActive = false;
    expect(receipt.id).toEqual(expect.any(Number));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      eventSequence: receipt.id,
      envelope: { kind: "log", event: { id: receipt.id, type: "custom.live" } },
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          kind: "log",
          event: expect.objectContaining({
            id: receipt.id,
            type: "custom.live",
          }),
        }),
      }),
    ]);
    await expect(
      channel.instance.getEnvelope(receipt.messageId),
    ).resolves.toEqual(deliveries[0].envelope.event);
    expect(nonces).toEqual([undefined]);
    expect(
      channel.gad.instance.getLogHead({ logId: "channel-1", head: "main" }),
    ).toBeNull();
    const [observation] = channel.instance.claimReadyWork(
      "channel-observation",
      { workerId: "live-check", now: Date.now(), limit: 1 },
    );
    const observing = channel.instance.executeChannelObservationClaim({
      itemId: observation!.itemId,
      generation: observation!.generation,
    });
    await started.promise;
    const replay = await channel.instance.getReplayAfter({ after: 0 });
    expect(
      replay.logEvents.some((event) => event.messageId === receipt.messageId),
    ).toBe(true);
    release.resolve(undefined);
    const observed = await observing;
    expect(
      channel.instance.settleReadyWork("channel-observation", {
        workerId: "live-check",
        itemId: observation!.itemId,
        generation: observation!.generation,
        outcome: observed,
      }),
    ).toBe("accepted");
    const [claim] = channel.instance.claimReadyWork("channel-delivery", {
      workerId: "live-check",
      now: Date.now(),
      limit: 1,
    });
    expect((claim!.payload as any).delivery).toMatchObject({
      deliveryId: deliveries[0].deliveryId,
      envelopeId: receipt.messageId,
      eventSequence: receipt.id,
    });
    expect((claim!.payload as any).delivery.agenticContext).toEqual(
      deliveries[0].agenticContext,
    );
    receiverRelease.resolve(undefined);
    await Promise.resolve();
    expect(nonces).toEqual([undefined, undefined]);
  });

  it("keeps valid local membership and history when graph observation fails, with original debt visible across activation", async () => {
    const failure = Object.assign(new Error("Graph unavailable"), {
      cause: new Error("Original service failure"),
      code: "GRAPH_DOWN",
    });
    const channel = await createGadBackedChannel({
      rpcCall: (_target, method) => {
        if (method === "appendLogEvent") throw failure;
      },
    });
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    const receipt = await channel.instance.publish(
      "panel:user",
      "custom.valid",
      { value: 1 },
    );
    const [claim] = channel.instance.claimReadyWork("channel-observation", {
      workerId: "graph-failure",
      now: Date.now(),
      limit: 1,
    });
    await expect(
      channel.instance.executeChannelObservationClaim({
        itemId: claim!.itemId,
        generation: claim!.generation,
      }),
    ).rejects.toBe(failure);
    expect(
      await channel.instance.failReadyWork("channel-observation", {
        workerId: "graph-failure",
        itemId: claim!.itemId,
        generation: claim!.generation,
        error: serializeRpcFailure(failure),
      }),
    ).toEqual({ failed: true });
    await expect(
      channel.instance.waitObservedThrough(receipt.id!),
    ).rejects.toMatchObject({
      message: "Graph unavailable",
      code: "GRAPH_DOWN",
      cause: expect.objectContaining({ message: "Original service failure" }),
    });
    await expect(
      channel.instance.getEnvelope(receipt.messageId),
    ).resolves.toMatchObject({ id: receipt.id });
    const reopened = await createGadBackedChannel({
      db: channel.db,
      gad: channel.gad,
    });
    expect(
      reopened.instance.claimReadyWork("channel-observation", {
        workerId: "new-generation",
        now: Date.now(),
        limit: 1,
      }),
    ).toEqual([]);
    await expect(
      reopened.instance.waitObservedThrough(receipt.id!),
    ).rejects.toMatchObject({
      message: "Graph unavailable",
      code: "GRAPH_DOWN",
    });
    const replay = await reopened.instance.getReplayAfter({ after: 0 });
    expect(
      replay.logEvents.some((event) => event.messageId === receipt.messageId),
    ).toBe(true);
  });

  it("fails durable publishes when blobstore storage fails", async () => {
    const { instance } = await createGadBackedChannel({
      blobstorePutText: async (value) => {
        if (!value.includes("must be stored")) {
          return { digest: sha256HexSyncText(value), size: value.length };
        }
        throw new Error("blobstore unavailable");
      },
    });
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    let error: unknown;
    try {
      await instance.publish("panel:user", "custom.large", {
        value: `must be stored ${"x".repeat(160 * 1024)}`,
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("blobstore unavailable");
  });

  it("spills large durable payloads to blobstore and replays hydrated payloads", async () => {
    const blobs = new Map<string, string>();
    const { instance } = await createGadBackedChannel({
      blobstorePutText: async (value) => {
        const digest = sha256HexSyncText(value);
        blobs.set(digest, value);
        return { digest, size: value.length };
      },
    });
    setRpcCaller(instance, "panel:user", "panel");
    const largeResult = "x".repeat(140 * 1024);

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      {
        ...agenticEvent("invocation.completed"),
        causality: { invocationId: "inv-large", transportCallId: "call-large" },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          result: { text: largeResult },
          terminalOutcome: "success",
        },
      },
      { idempotencyKey: "large-publish" },
    );

    const replay = await instance.getReplayAfter({ after: 1 });
    const event = replay.logEvents.find(
      (item) => item.type === AGENTIC_EVENT_PAYLOAD_KIND,
    );
    const payload = ((event?.payload as { payload?: unknown })?.payload ??
      {}) as Record<string, unknown>;
    expect(blobs.size).toBeGreaterThan(0);
    expect(payload["result"]).toEqual({ text: largeResult });
  });

  it("replays envelopes by sequence and paginates before a sequence", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
    );
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
    );

    const afterOne = await instance.getReplayAfter({ after: 1 });
    expect(afterOne.logEvents.map((event) => event.id)).toEqual([2, 3]);
    expect(afterOne.ready).toMatchObject({
      totalCount: 3,
      envelopeCount: 3,
      firstEnvelopeSeq: 1,
    });

    const beforeThree = await instance.getReplayBefore(3, 1);
    expect(beforeThree.mode).toBe("before");
    expect(beforeThree.logEvents.map((event) => event.id)).toEqual([2]);
    expect(beforeThree.ready.hasMoreBefore).toBe(true);
  });

  it("looks up a durable envelope by its stable id", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
      { idempotencyKey: "lookup-one" },
    );

    await expect(instance.getEnvelope("ik:lookup-one")).resolves.toMatchObject({
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "panel:user",
    });
    await expect(instance.getEnvelope("missing-envelope")).resolves.toBeNull();
  });

  it("delivers live envelopes to RPC subscribers", async () => {
    const emitted: unknown[] = [];
    const { instance } = await createGadBackedChannel({ emitted });
    setRpcCaller(instance, "panel:live", "panel");

    await instance.subscribe("panel:live", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:live",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(
      emitted.some((payload) => {
        const message = (
          payload as { message?: { kind?: string; event?: { type?: string } } }
        ).message;
        return (
          message?.kind === "log" &&
          message.event?.type === AGENTIC_EVENT_PAYLOAD_KIND
        );
      }),
    ).toBe(true);
  });

  it("keeps later durable deliveries behind a lane head in retry backoff", async () => {
    const agentId = "do:workers/agent-worker:AiChatWorker:headless-denied";
    const { instance } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });

    setRpcCaller(instance, agentId, "durable-object");
    await instance.join({
      participantId: agentId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Denied agent", type: "agent" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: agentId, invocation: "direct" },
      applicationConfig: null,
      replay: true,
    });
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );

    const [claim] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-1",
      now: Date.now(),
      limit: 1,
    });
    expect(claim).toBeDefined();
    expect(
      (claim!.payload as { delivery: { participantId: string } }).delivery
        .participantId,
    ).toBe(agentId);
    const failed = await instance.failReadyWork("channel-delivery", {
      workerId: "driver-1",
      itemId: claim!.itemId,
      generation: claim!.generation,
      error: serializeRpcFailure(new Error("held recipient refused")),
    });
    expect(failed).toEqual({ retryAt: expect.any(Number) });
    expect(instance.durableWorkStatus().nextRecoveryAt).toEqual(
      expect.any(Number),
    );

    // A newly published envelope is ready immediately, but allowing it to
    // overtake the failed lane head would make lifecycle terminals observable
    // before their corresponding starts.
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    expect(
      instance.claimReadyWork("channel-delivery", {
        workerId: "driver-1",
        now: Date.now(),
        limit: 1,
      }),
    ).toEqual([]);
    const retryAt = (failed as { retryAt: number }).retryAt;
    expect(instance.durableWorkStatus()).toMatchObject({
      readyQueues: ["channel-observation"],
      nextRecoveryAt: expect.any(Number),
    });

    const [retry] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-1",
      now: retryAt,
      limit: 1,
    });
    expect(retry!.itemId).toBe(claim!.itemId);
  });

  it("does not let an unavailable failure from an old claim detach a replacement receiver", async () => {
    const residentId = "do:vibestudio/internal:EvalDO:resident-generation";
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });
    await joinResidentSession(instance, residentId);
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );

    const [oldClaim] = instance.claimReadyWork("channel-delivery", {
      workerId: "old-driver",
      now: Date.now(),
      limit: 1,
    });
    expect(oldClaim).toBeDefined();

    setRpcCaller(instance, residentId, "durable-object");
    await instance.join({
      participantId: residentId,
      operationId: "join-2",
      contextId: "ctx-1",
      metadata: { name: "Replacement resident", type: "client" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: residentId, invocation: "mailbox" },
      applicationConfig: null,
      replay: true,
    });

    await expect(
      instance.failReadyWork("channel-delivery", {
        workerId: "old-driver",
        itemId: oldClaim!.itemId,
        generation: oldClaim!.generation,
        error: serializeRpcFailure(
          Object.assign(new Error("old receiver disappeared"), {
            code: "ResidentSessionUnavailable",
            errorKind: "transport" as const,
          }),
        ),
      }),
    ).resolves.toEqual({ retryAt: expect.any(Number) });
    expect(
      sql
        .exec(
          `SELECT revision, attached FROM channel_relationships WHERE participant_id = ?`,
          residentId,
        )
        .toArray(),
    ).toEqual([expect.objectContaining({ revision: 2, attached: 1 })]);
    expect(
      instance.claimReadyWork("channel-delivery", {
        workerId: "replacement-driver",
        now: Date.now(),
        limit: 1,
      })[0]?.itemId,
    ).toBe(oldClaim!.itemId);
  });

  it("terminalizes permanent delivery poison and unblocks the ordered lane", async () => {
    const residentId = "do:vibestudio/internal:EvalDO:permanent-poison";
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });
    await joinResidentSession(instance, residentId);
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );

    const [poison] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-poison",
      now: Date.now(),
      limit: 1,
    });
    await expect(
      instance.failReadyWork("channel-delivery", {
        workerId: "driver-poison",
        itemId: poison!.itemId,
        generation: poison!.generation,
        error: serializeRpcFailure(
          Object.assign(new Error("malformed durable envelope"), {
            code: "PermanentChannelDelivery",
            errorKind: "application" as const,
          }),
        ),
      }),
    ).resolves.toEqual({ retryAt: expect.any(Number) });
    expect(
      sql
        .exec(
          `SELECT state FROM channel_delivery_mailbox WHERE delivery_id = ?`,
          poison!.itemId,
        )
        .toArray(),
    ).toEqual([{ state: "terminal-integrity" }]);
    const [next] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-poison",
      now: Date.now(),
      limit: 1,
    });
    expect(next?.itemId).toBeDefined();
    expect(next?.itemId).not.toBe(poison!.itemId);
  });

  it("settles one finite delivery by its stable delivery id", async () => {
    const agentId = "do:workers/agent-worker:AiChatWorker:agent-settlement";
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });
    setRpcCaller(instance, agentId, "durable-object");
    await instance.join({
      participantId: agentId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Agent", type: "agent" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: agentId, invocation: "direct" },
      applicationConfig: null,
      replay: true,
    });
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );

    const [claim] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-1",
      now: Date.now(),
      limit: 1,
    });
    expect(
      instance.settleReadyWork("channel-delivery", {
        workerId: "driver-1",
        itemId: claim!.itemId,
        generation: claim!.generation,
        outcome: { processed: true, recipientExecutionStartedAt: Date.now() },
      }),
    ).toBe("accepted");
    expect(
      sql
        .exec(
          `SELECT samples FROM channel_delivery_latency_histogram
            WHERE metric = 'publish-to-recipient-execution'`,
        )
        .toArray(),
    ).toEqual([expect.objectContaining({ samples: 1 })]);
    const state = await instance.getState();
    expect(state["deliveryLifecycle"]).toMatchObject({
      longestDeliveries: [
        {
          delivery_id: claim!.itemId,
          participant_id: agentId,
          envelope_id: expect.any(String),
          event_sequence: expect.any(Number),
          published_at: expect.any(Number),
          execution_started_at: expect.any(Number),
          duration_ms: expect.any(Number),
        },
      ],
    });
    const [next] = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-1",
      now: Date.now(),
      limit: 1,
    });
    expect(next?.itemId).not.toBe(claim!.itemId);
  });

  it("derives every executable recipient through the same entity endpoint", async () => {
    const agentDoId = "do:workers/agent-worker:AiChatWorker:agent-x";
    const clientDoId = "do:vibestudio/internal:EvalDO:client-x";
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });

    setRpcCaller(instance, agentDoId, "durable-object");
    await instance.join({
      participantId: agentDoId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Agent", type: "agent" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: agentDoId, invocation: "direct" },
      applicationConfig: null,
      replay: true,
    });
    setRpcCaller(instance, clientDoId, "durable-object");
    await instance.join({
      participantId: clientDoId,
      operationId: "join-1",
      contextId: "ctx-1",
      metadata: { name: "Eval client", type: "client" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: clientDoId, invocation: "mailbox" },
      applicationConfig: null,
      replay: true,
    });

    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    const claims = instance.claimReadyWork("channel-delivery", {
      workerId: "driver-1",
      now: Date.now(),
      limit: 10,
    });
    expect(claims.map((claim) => claim.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivery: expect.objectContaining({
            participantId: agentDoId,
            agenticContext: expect.objectContaining({ version: 1 }),
          }),
        }),
        expect.objectContaining({
          delivery: expect.objectContaining({
            participantId: clientDoId,
            agenticContext: null,
          }),
        }),
      ]),
    );
    expect(
      sql
        .exec(`SELECT COUNT(*) AS contexts FROM channel_delivery_event_context`)
        .toArray()[0],
    ).toEqual({ contexts: 1 });
    expect(
      sql
        .exec(
          `SELECT COUNT(*) AS copied
             FROM channel_delivery_mailbox
            WHERE agentic_context_json IS NOT NULL`,
        )
        .toArray()[0],
    ).toEqual({ copied: 0 });
  });

  it("routes addressed task facts without copying ordinary child activity to the supervisor", async () => {
    const supervisorId = "do:workers/agent-worker:AiChatWorker:supervisor";
    const childId = "do:workers/agent-worker:AiChatWorker:child";
    const { instance, sql } = await createGadBackedChannel();

    setRpcCaller(instance, supervisorId, "durable-object");
    await instance.join({
      participantId: supervisorId,
      operationId: "join-1",
      contextId: "ctx-task",
      metadata: { name: "Supervisor", type: "agent" },
      delivery: "addressed",
      endpoint: {
        kind: "entity",
        entityId: supervisorId,
        invocation: "direct",
      },
      applicationConfig: null,
      replay: true,
    });
    setRpcCaller(instance, childId, "durable-object");
    await instance.join({
      participantId: childId,
      operationId: "join-1",
      contextId: "ctx-task",
      metadata: { name: "Child", type: "agent" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: childId, invocation: "direct" },
      applicationConfig: null,
      replay: true,
    });

    await instance.publish(childId, AGENTIC_EVENT_PAYLOAD_KIND, {
      ...agenticEvent("invocation.progress"),
      actor: { kind: "agent", id: childId },
      causality: { invocationId: "tool-1" },
      payload: { protocol: AGENTIC_PROTOCOL_VERSION, delta: "working" },
    });
    expect(
      sql
        .exec(
          `SELECT delivery_id FROM channel_delivery_mailbox WHERE participant_id = ?`,
          supervisorId,
        )
        .toArray(),
    ).toEqual([]);

    await instance.publish(childId, AGENTIC_EVENT_PAYLOAD_KIND, {
      ...agenticEvent("task.completed"),
      actor: { kind: "agent", id: childId },
      causality: { taskId: "run-1" },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        terminalOutcome: "success",
        to: [{ kind: "participant", participantId: supervisorId }],
      },
    });
    expect(
      sql
        .exec(
          `SELECT participant_id, state FROM channel_delivery_mailbox WHERE participant_id = ?`,
          supervisorId,
        )
        .toArray(),
    ).toEqual([{ participant_id: supervisorId, state: "ready" }]);
  });

  it("records read receipts as a projection without appending or creating mailbox work", async () => {
    const agents = [
      "do:workers/agent-worker:AiChatWorker:receipt-a",
      "do:workers/agent-worker:AiChatWorker:receipt-b",
      "do:workers/agent-worker:AiChatWorker:receipt-c",
    ];
    const { instance, sql } = await createGadBackedChannel();
    for (const agentId of agents) await joinEntity(instance, agentId);
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );

    const logCountBefore = Number(canonicalLedger(instance).headSequence());
    const mailboxCountBefore = Number(
      sql
        .exec(`SELECT COUNT(*) AS count FROM channel_delivery_mailbox`)
        .toArray()[0]!["count"],
    );
    for (const agentId of agents) {
      setRpcCaller(instance, agentId, "durable-object");
      await instance.recordReceipt(agentId, "msg-1", "read", {
        turnId: `turn:${agentId}`,
      });
    }

    expect(Number(canonicalLedger(instance).headSequence())).toBe(
      logCountBefore,
    );
    expect(
      Number(
        sql
          .exec(`SELECT COUNT(*) AS count FROM channel_delivery_mailbox`)
          .toArray()[0]!["count"],
      ),
    ).toBe(mailboxCountBefore);
    const replay = await instance.getReplayAfter({ after: 0 });
    const receiptSnapshot = replay.snapshots.find(
      (snapshot) => snapshot.kind === "receipt-snapshot",
    );
    expect(receiptSnapshot).toMatchObject({
      kind: "receipt-snapshot",
      events: expect.arrayContaining(
        agents.map((agentId) =>
          expect.objectContaining({
            senderId: agentId,
            payload: expect.objectContaining({ kind: "message.read" }),
          }),
        ),
      ),
    });
  });

  it("reconstructs durable membership and a missing mailbox projection after activation loss", async () => {
    const agentId = "do:workers/agent-worker:AiChatWorker:restart-recipient";
    const first = await createGadBackedChannel();
    await joinEntity(first.instance, agentId);
    setRpcCaller(first.instance, "panel:user", "panel");
    await first.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    const published = await first.instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    expect(published.id).toBeDefined();
    const publishedSequence = published.id!;

    // Emulate loss after the canonical append but before projection commit.
    first.sql.exec(
      `DELETE FROM channel_delivery_mailbox WHERE event_sequence = ?`,
      publishedSequence,
    );
    first.sql.exec(`DELETE FROM channel_receipts WHERE message_id = 'msg-1'`);
    first.sql.exec(
      `UPDATE channel_delivery_projection_cursor SET log_sequence = ? WHERE singleton = 1`,
      publishedSequence - 1,
    );

    const restarted = await createGadBackedChannel({
      gad: first.gad,
      db: first.db,
    });
    await restarted.instance.adoptDurableWorkWorker("driver-after-restart");
    setRpcCaller(restarted.instance, agentId, "durable-object");
    await expect(
      restarted.instance.relationshipState(agentId),
    ).resolves.toEqual({
      revision: 1,
      active: true,
    });
    expect(
      restarted.sql
        .exec(
          `SELECT participant_id, event_sequence, state
             FROM channel_delivery_mailbox
            WHERE participant_id = ?`,
          agentId,
        )
        .toArray(),
    ).toEqual([
      { participant_id: agentId, event_sequence: published.id, state: "ready" },
    ]);
    const state = await restarted.instance.getState();
    expect(state["liveTransport"]).toMatchObject({ count: 0, streams: [] });
    expect(state["delivery"]).toMatchObject({ cursor: published.id, lag: 0 });
  });

  it("reports an envelope-only schema", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "server:test", "server");

    const schema = await instance.adminInspectSchema();
    const envelopeTable = schema.tables.find(
      (table) => table.table === "channel_envelopes",
    );

    expect(envelopeTable).toBeUndefined();
    expect(schema.invariants.every((invariant) => invariant.ok)).toBe(true);
  });

  it("routes pause method calls through visible method invocation transport", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-1";
    const rpcCalls: Array<{ target: string; method: string; args: unknown[] }> =
      [];
    const channel = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (target === targetPid && method === "onChannelEnvelope") return null;
        if (target === targetPid && method === "onMethodCall") {
          rpcCalls.push({ target, method, args });
          const admission = args[4] as { providerClaimGeneration: number };
          await expect(
            channel.callAs(
              { callerId: targetPid, callerKind: "do" },
              "markMethodCallExecutionStarted",
              targetPid,
              args[1],
              admission.providerClaimGeneration,
            ),
          ).resolves.toEqual({ accepted: true });
          return { result: { paused: true } };
        }
        return undefined;
      },
    });
    const { instance } = channel;

    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await joinEntity(instance, targetPid, { name: "AI Chat", type: "agent" });

    setRpcCaller(instance, "panel:user", "panel");
    await instance.callMethod(
      "panel:user",
      targetPid,
      "pause-call",
      "pause",
      { reason: "User interrupted execution" },
      { invocationId: "pause-invocation", transportCallId: "pause-call" },
    );

    expect(rpcCalls).toEqual([
      {
        target: targetPid,
        method: "onMethodCall",
        args: [
          "channel-1",
          "pause-call",
          "pause",
          { reason: "User interrupted execution" },
          {
            invocationId: "pause-invocation",
            turnId: undefined,
            providerClaimGeneration: 1,
          },
        ],
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const events = canonicalAgenticEvents(instance);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.started",
          causality: {
            invocationId: "pause-invocation",
            transportCallId: "pause-call",
          },
        }),
        expect.objectContaining({
          kind: "invocation.completed",
          causality: {
            invocationId: "pause-invocation",
            transportCallId: "pause-call",
          },
          payload: expect.objectContaining({ terminalOutcome: "success" }),
        }),
      ]),
    );
  });

  it("routes resident-session method calls through the durable event path", async () => {
    const evalPid = "do:vibestudio/internal:EvalDO:eval-1";
    const rpcCalls: Array<{ target: string; method: string }> = [];
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        rpcCalls.push({ target, method });
        return undefined;
      },
    });

    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await joinResidentSession(instance, evalPid, {
      name: "Eval client",
      type: "client",
    });

    setRpcCaller(instance, "panel:user", "panel");
    await instance.callMethod(
      "panel:user",
      evalPid,
      "title-call",
      "set_title",
      { title: "Hello" },
      { invocationId: "title-inv", transportCallId: "title-call" },
    );

    expect(
      rpcCalls.some((c) => c.target === evalPid && c.method === "onMethodCall"),
    ).toBe(false);
    await vi.waitFor(() =>
      expect(
        rpcCalls.some(
          (c) => c.target === evalPid && c.method === "acceptChannelInvocation",
        ),
      ).toBe(true),
    );

    setRpcCaller(instance, evalPid, "durable-object");
    const providerClaim = await instance.claimMethodCall(
      evalPid,
      "title-call",
      "eval-generation-1",
    );
    expect(
      sql
        .exec(
          `SELECT samples FROM channel_delivery_latency_histogram
            WHERE metric = 'call-to-provider-execution'`,
        )
        .toArray(),
    ).toEqual([]);
    await expect(
      instance.markMethodCallExecutionStarted(
        evalPid,
        "title-call",
        providerClaim.generation!,
      ),
    ).resolves.toEqual({ accepted: true });
    await expect(
      instance.markMethodCallExecutionStarted(
        evalPid,
        "title-call",
        providerClaim.generation!,
      ),
    ).resolves.toEqual({ accepted: true });
    expect(
      sql
        .exec(
          `SELECT samples FROM channel_delivery_latency_histogram
            WHERE metric = 'call-to-provider-execution'`,
        )
        .toArray(),
    ).toEqual([expect.objectContaining({ samples: 1 })]);
    const adoptedClaim = await instance.claimMethodCall(
      evalPid,
      "title-call",
      "eval-generation-2",
    );
    await expect(
      instance.markMethodCallExecutionStarted(
        evalPid,
        "title-call",
        providerClaim.generation!,
      ),
    ).resolves.toEqual({ accepted: false });
    await instance.submitMethodProgress(
      evalPid,
      "title-call",
      "stale progress",
      {
        invocationId: "title-inv",
        providerClaimGeneration: providerClaim.generation,
      },
    );
    await instance.submitMethodProgress(
      evalPid,
      "title-call",
      "current progress",
      {
        invocationId: "title-inv",
        providerClaimGeneration: adoptedClaim.generation,
      },
    );
    await expect(
      instance.submitMethodResult(
        evalPid,
        "title-call",
        { stale: true },
        false,
        {
          invocationId: "title-inv",
          providerClaimGeneration: providerClaim.generation,
        },
      ),
    ).resolves.toMatchObject({
      dropped: true,
      reason: "superseded-provider-claim",
    });
    await instance.submitMethodResult(
      evalPid,
      "title-call",
      { ok: true },
      false,
      {
        invocationId: "title-inv",
        providerClaimGeneration: adoptedClaim.generation,
      },
    );

    const events = canonicalAgenticEvents(instance);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.started",
          causality: {
            invocationId: "title-inv",
            transportCallId: "title-call",
          },
        }),
        expect.objectContaining({
          kind: "invocation.completed",
          causality: {
            invocationId: "title-inv",
            transportCallId: "title-call",
          },
          payload: expect.objectContaining({ terminalOutcome: "success" }),
        }),
      ]),
    );
    // Only the current provider generation may append progress. The payload is
    // blob-spilled by this fixture, so row cardinality is the authoritative
    // stale-generation assertion here.
    expect(
      events.filter((event) => event.kind === "invocation.output"),
    ).toHaveLength(1);
  });

  it.each([
    {
      name: "vessel",
      target: "do:workers/agent-worker:AiChatWorker:matrix",
      route: "direct",
    },
    {
      name: "resident",
      target: "do:vibestudio/internal:EvalDO:matrix-live",
      route: "mailbox",
    },
    {
      name: "disconnected resident",
      target: "do:vibestudio/internal:EvalDO:matrix-disconnected",
      route: "mailbox-refused",
    },
    { name: "live session", target: "panel:matrix-provider", route: "session" },
  ])(
    "route matrix: $name call, redrive, and cancel converge on one terminal",
    async (row) => {
      const rpcCalls: Array<{ target: string; method: string }> = [];
      const directResult = deferred<{ result: unknown }>();
      const directStarted = deferred();
      const directRedriven = deferred();
      let directDeliveries = 0;
      const cancellationDelivered = deferred();
      const channel = await createGadBackedChannel({
        rpcCall: async (target, method, args) => {
          if (
            target === "main" &&
            method === "workspace-state.entity.resolveActive"
          ) {
            return activeEntityFixture(args[0]);
          }
          rpcCalls.push({ target, method });
          if (
            row.route === "mailbox-refused" &&
            method === "acceptChannelInvocation"
          ) {
            throw Object.assign(new Error("no active receiver"), {
              code: "ResidentSessionUnavailable",
            });
          }
          if (method === "onMethodCall") {
            const admission = args[4] as { providerClaimGeneration: number };
            await expect(
              channel.callAs(
                { callerId: row.target, callerKind: "do" },
                "markMethodCallExecutionStarted",
                row.target,
                args[1],
                admission.providerClaimGeneration,
              ),
            ).resolves.toEqual({ accepted: true });
            directDeliveries++;
            if (directDeliveries === 1) directStarted.resolve();
            else directRedriven.resolve();
            return directResult.promise;
          }
          if (method === "cancelDirectMethodCall")
            cancellationDelivered.resolve();
          if (
            method === "acceptChannelInvocation" ||
            method === "cancelDirectMethodCall" ||
            method === "cancelChannelInvocation"
          ) {
            return null;
          }
          return undefined;
        },
      });
      const { instance, sql } = channel;
      setRpcCaller(instance, "panel:matrix-caller", "panel");
      await instance.subscribe("panel:matrix-caller", {
        contextId: "ctx-1",
        name: "Caller",
        type: "panel",
      });
      if (row.route === "session") {
        setRpcCaller(instance, row.target, "panel");
        await instance.subscribe(row.target, {
          contextId: "ctx-1",
          name: "Provider",
          type: "panel",
        });
      } else {
        setRpcCaller(instance, row.target, "durable-object");
        await instance.join({
          participantId: row.target,
          operationId: "join-1",
          contextId: "ctx-1",
          metadata: { name: row.name, type: "client" },
          delivery: "all",
          endpoint: {
            kind: "entity",
            entityId: row.target,
            invocation: row.route === "direct" ? "direct" : "mailbox",
          },
          applicationConfig: null,
          replay: true,
        });
      }

      const options = {
        invocationId: `matrix-invocation-${row.name}`,
        transportCallId: `matrix-transport-${row.name}`,
        turnId: `matrix-turn-${row.name}`,
      };
      setRpcCaller(instance, "panel:matrix-caller", "panel");
      await instance.callMethod(
        "panel:matrix-caller",
        row.target,
        options.transportCallId,
        "eval",
        { code: "1 + 1" },
        options,
      );
      if (row.route === "direct") await directStarted.promise;
      await instance.callMethod(
        "panel:matrix-caller",
        row.target,
        options.transportCallId,
        "eval",
        { code: "1 + 1" },
        options,
      );
      if (row.route === "direct") await directRedriven.promise;
      let cancelled = false;
      const cancellation = instance
        .cancelMethodCall("panel:matrix-caller", options.transportCallId)
        .then(() => {
          cancelled = true;
        });
      if (row.route === "direct") {
        await cancellationDelivered.promise;
        try {
          expect(cancelled).toBe(false);
        } finally {
          directResult.resolve({ result: { ignoredAfterCancellation: true } });
        }
      }
      await cancellation;

      expect(
        [canonicalLedger(instance).envelope(options.invocationId)].filter(
          Boolean,
        ),
      ).toHaveLength(1);
      expect(
        [
          canonicalLedger(instance).envelope(
            `terminal:${options.transportCallId}`,
          ),
        ].filter(Boolean),
      ).toHaveLength(1);
      expect([
        canonicalAgenticEvent(instance, `terminal:${options.transportCallId}`),
      ]).toEqual([
        expect.objectContaining({
          kind: "invocation.cancelled",
          payload: expect.objectContaining({
            terminalOutcome: "cancelled",
            to: [
              { kind: "participant", participantId: "panel:matrix-caller" },
              { kind: "participant", participantId: row.target },
            ],
          }),
        }),
      ]);
      if (row.route === "direct") {
        expect(rpcCalls.some((call) => call.method === "onMethodCall")).toBe(
          true,
        );
        expect(
          rpcCalls.some((call) => call.method === "cancelDirectMethodCall"),
        ).toBe(true);
      } else if (row.route === "session") {
        expect(rpcCalls.some((call) => call.target === row.target)).toBe(false);
      } else {
        expect(
          rpcCalls.some((call) => call.method === "acceptChannelInvocation"),
        ).toBe(true);
        expect(
          rpcCalls.some((call) => call.method === "cancelChannelInvocation"),
        ).toBe(true);
        expect(
          sql
            .exec(
              `SELECT COUNT(*) AS count FROM channel_delivery_mailbox
              WHERE participant_id = ? AND event_id = ?`,
              row.target,
              options.invocationId,
            )
            .toArray()[0]?.["count"],
        ).toBe(1);
      }
    },
  );

  it("reports channel-scoped target absence for method calls to participants outside the live roster", async () => {
    const { instance } = await createGadBackedChannel();
    const targetPid =
      "do:workers/agent-worker:AiChatWorker:agent-outside-channel";

    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.callMethod(
      "panel:user",
      targetPid,
      "debug-call",
      "getDebugState",
      {},
      { invocationId: "debug-invocation", transportCallId: "debug-call" },
    );

    const replay = await instance.getReplayAfter({ after: 0 });
    const events = replay.logEvents
      .filter((event) => event.type === AGENTIC_EVENT_PAYLOAD_KIND)
      .map((event) => event.payload);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.failed",
          causality: {
            invocationId: "debug-invocation",
            transportCallId: "debug-call",
          },
          payload: expect.objectContaining({
            error: expect.objectContaining({
              error: expect.stringContaining(
                "is not joined to channel channel-1; chat.callMethod is channel-scoped",
              ),
            }),
            terminalOutcome: "tool_error",
            terminalReasonCode: "method_failed",
          }),
        }),
      ]),
    );
  });

  it("atomically replaces a human delivery stream without abandoning pending calls", async () => {
    const { instance, sql } = await createGadBackedChannel();
    const userParticipantId = "user:usr_alice";

    setRpcCaller(
      instance,
      "panel:slot-a",
      "panel",
      "panel:slot-a",
      "usr_alice",
    );
    await instance.subscribe(userParticipantId, {
      contextId: "ctx-1",
      name: "Chat panel",
      type: "panel",
      methods: [{ name: "feedback_form" }],
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    await instance.callMethod(
      "panel:caller",
      userParticipantId,
      "feedback-transport",
      "feedback_form",
      { title: "Question", fields: [] },
      {
        invocationId: "feedback-invocation",
        transportCallId: "feedback-transport",
        turnId: "feedback-turn",
      },
    );

    setRpcCaller(
      instance,
      "panel:slot-a",
      "panel",
      "panel:slot-a",
      "usr_alice",
    );
    await instance.subscribe(userParticipantId, {
      contextId: "ctx-1",
      name: "Chat panel",
      type: "panel",
      methods: [{ name: "feedback_form" }],
      sinceId: 10_000,
    });

    const lifecycle = canonicalLedger(instance).read({ limit: 100 });
    expect(
      lifecycle.some(
        (entry) =>
          entry.payloadKind === "presence" &&
          (entry.payload as { action?: string }).action === "leave",
      ),
    ).toBe(false);
    expect(
      lifecycle.some(
        (entry) =>
          entry.payloadKind === "invocation.abandoned" &&
          entry.causality?.["invocationId"] === "feedback-invocation",
      ),
    ).toBe(false);
    expect(
      sql
        .exec(
          `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
          "feedback-transport",
        )
        .toArray(),
    ).toHaveLength(1);

    setRpcCaller(
      instance,
      "panel:slot-a",
      "panel",
      "panel:slot-a",
      "usr_alice",
    );
    await instance.submitMethodResult(
      userParticipantId,
      "feedback-transport",
      { answer: "private" },
      false,
      {
        invocationId: "feedback-invocation",
        turnId: "feedback-turn",
        terminalOutcome: "success",
      },
    );
  });

  it("inspects a DO-backed agent debug method without requiring a live roster row", async () => {
    const targetPid =
      "do:workers/agent-worker:AiChatWorker:agent-recently-active";
    const rpcCalls: Array<{ target: string; method: string; args: unknown[] }> =
      [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (target === targetPid && method === "readAgentInspection") {
          rpcCalls.push({ target, method, args });
          return { result: { loops: { "channel-1": { turnStatus: "idle" } } } };
        }
        return undefined;
      },
    });

    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.inspectAgent({
        participantId: targetPid,
        method: "getDebugState",
      }),
    ).resolves.toMatchObject({
      participantId: targetPid,
      channelId: "channel-1",
      method: "getDebugState",
      result: { loops: { "channel-1": { turnStatus: "idle" } } },
      roster: { present: false },
    });
    expect(rpcCalls).toEqual([
      {
        target: targetPid,
        method: "readAgentInspection",
        args: ["channel-1", "getDebugState"],
      },
    ]);
  });

  it("keeps activation-local inspection off the ordinary agent method-call path", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-stalled-turn";
    const routedMethods: string[] = [];
    let inspectionOptions:
      | { readOnly?: boolean; timeoutMs?: number }
      | undefined;
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, _args, options) => {
        if (target === targetPid) {
          routedMethods.push(method);
          if (method === "onMethodCall") return new Promise(() => {});
          if (method === "readAgentInspection") {
            inspectionOptions = options;
            return {
              result: {
                loops: {
                  "channel-1": {
                    loaded: true,
                    turnStatus: "running",
                  },
                },
              },
            };
          }
        }
        return undefined;
      },
    });

    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.inspectAgent({
        participantId: targetPid,
        method: "getDebugState",
      }),
    ).resolves.toMatchObject({
      result: {
        loops: {
          "channel-1": { loaded: true, turnStatus: "running" },
        },
      },
    });
    expect(routedMethods).toEqual(["readAgentInspection"]);
    expect(inspectionOptions).toEqual({ readOnly: true });
  });

  it("lets the direct relay reject a retired or missing inspected agent without reactivation", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-retired";
    const routedMethods: string[] = [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method) => {
        if (
          target === "main" &&
          (method === "workers.resolveDurableObject" ||
            method === "workspace-state.entity.resolveActive")
        ) {
          throw new Error(
            "agent inspection must not resolve or reactivate its target",
          );
        }
        if (target === targetPid) {
          routedMethods.push(method);
          throw Object.assign(
            new Error("agent entity is not active or missing"),
            {
              code: "DO_NOT_CREATED",
            },
          );
        }
        return undefined;
      },
    });

    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.inspectAgent({
        participantId: targetPid,
        method: "getDebugState",
      }),
    ).rejects.toMatchObject({
      message: "agent entity is not active or missing",
      code: "DO_NOT_CREATED",
    });
    expect(routedMethods).toEqual(["readAgentInspection"]);
  });

  it("runs an already-admitted inspection without a second advisory approval", async () => {
    const targetPid =
      "do:workers/agent-worker:AiChatWorker:agent-recently-active";
    const rpcCalls: Array<{ target: string; method: string; args: unknown[] }> =
      [];
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (target === targetPid && method === "readAgentInspection") {
          rpcCalls.push({ target, method, args });
          return { result: { settings: { model: "test:model" } } };
        }
        return undefined;
      },
    });

    setRpcCaller(instance, "do:vibestudio/internal:EvalDO:agent-eval", "do");
    await expect(
      instance.inspectAgent({
        participantId: targetPid,
        method: "getAgentSettings",
      }),
    ).resolves.toMatchObject({
      participantId: targetPid,
      channelId: "channel-1",
      method: "getAgentSettings",
      result: { settings: { model: "test:model" } },
      roster: { present: false },
    });
    expect(rpcCalls).toEqual([
      {
        target: targetPid,
        method: "readAgentInspection",
        args: ["channel-1", "getAgentSettings"],
      },
    ]);
  });

  it("defaults inspection to the channel's sole agent participant", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-only";
    const rpcTargets: string[] = [];
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: (target, method) => {
        if (method === "readAgentInspection") {
          rpcTargets.push(target);
          return { result: { loaded: true } };
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.inspectAgent({ method: "getDebugState" }),
    ).rejects.toThrow(/participantId is required.*no agent participant/u);

    const insert = (id: string) =>
      sql.exec(
        `INSERT INTO participants (id, metadata, transport) VALUES (?, '{}', 'do')`,
        id,
      );
    insert(targetPid);
    await expect(
      instance.inspectAgent({ method: "getDebugState" }),
    ).resolves.toMatchObject({
      participantId: targetPid,
      roster: { present: true, transport: "do" },
    });
    expect(rpcTargets).toEqual([targetPid]);

    insert("do:workers/agent-worker:AiChatWorker:agent-second");
    await expect(
      instance.inspectAgent({ method: "getDebugState" }),
    ).rejects.toThrow(/2 agent participants/u);
  });

  it("declares inspection as a receiver-enforced channel capability", async () => {
    const { instance } = await createGadBackedChannel();
    expect(rpcMethodAuthority(instance, "inspectAgent")).toMatchObject({
      website: { kind: "eligible" },
      principals: ["host", "user", "code", "website"],
      effect: {
        kind: "userland-capability",
        capability: "channel.admin",
        resource: { kind: "receiver-object" },
      },
      tier: "gated",
      sensitivity: "admin",
    });
  });

  it("limits admin agent inspection to standard read-only debug methods", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "server:test", "server");
    await expect(
      instance.inspectAgent({
        participantId:
          "do:workers/agent-worker:AiChatWorker:agent-recently-active",
        method: "pause",
      } as never),
    ).rejects.toThrow(/invalid request.*pause/u);
  });

  it("uses GAD as the durable channel log backend without changing replay shape", async () => {
    const { instance, sql } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
    );

    expect(
      sql
        .exec(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel_envelopes'`,
        )
        .toArray(),
    ).toEqual([]);
    const replay = await instance.getReplayAfter({ after: 1 });
    expect(
      replay.logEvents.map((event) => ({
        id: event.id,
        type: event.type,
        senderId: event.senderId,
      })),
    ).toEqual([
      { id: 2, type: AGENTIC_EVENT_PAYLOAD_KIND, senderId: "panel:user" },
    ]);
    expect(replay.ready).toMatchObject({
      totalCount: 2,
      envelopeCount: 2,
      firstEnvelopeSeq: 1,
    });
    expect(replay.snapshots[0]).toMatchObject({
      kind: "roster-snapshot",
      participants: [
        expect.objectContaining({
          id: "panel:user",
          ref: expect.objectContaining({
            kind: "panel",
            id: "panel:user",
            participantId: "panel:user",
          }),
        }),
      ],
    });
    expect(await instance.getParticipants()).toEqual([
      expect.objectContaining({
        participantId: "panel:user",
        ref: expect.objectContaining({
          kind: "panel",
          id: "panel:user",
          participantId: "panel:user",
        }),
      }),
    ]);
  });

  it("ledger:channel.fork.context-and-log-origin", async () => {
    const parent = await createGadBackedChannel({
      channelKey: "channel-parent",
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    await parent.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await parent.instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
    );
    await parent.instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, {
      ...agenticEvent("message.completed"),
      causality: { messageId: "msg-2" },
    });

    // A later append may land before the storage snapshot is copied. The
    // child owns only the explicitly selected prefix, not the copied tail.
    await parent.instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, {
      ...agenticEvent("message.completed"),
      causality: { messageId: "msg-parent-tail" },
    });
    const parentPrefix = await parent.instance.getReplayAfter({
      after: 0,
      throughSeq: 3,
    });

    const fork = await createGadBackedChannel({
      channelKey: "channel-fork",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
    });
    await initializeChannelClone(fork, "channel-parent", "ctx-forked", "ctx-1");
    await fork.instance.postClone("channel-parent", 3, "ctx-forked");

    const replay = await fork.instance.getReplayAfter({ after: 0 });
    // The cloned ledger retains the parent prefix verbatim, including the
    // relationship and message facts with their original sequence numbers;
    // presence is intentionally an activation-local signal.
    expect(replay.logEvents.map((event) => event.id)).toEqual([1, 2, 3]);
    expect(replay.logEvents).toEqual(parentPrefix.logEvents);
    const messages = replay.logEvents.filter(
      (event) => event.type === AGENTIC_EVENT_PAYLOAD_KIND,
    );
    expect(
      messages.map(
        (event) =>
          (event.payload as { causality: { messageId: string } }).causality
            .messageId,
      ),
    ).toEqual(["msg-1", "msg-2"]);
    expect(replay.ready).toMatchObject({
      totalCount: 3,
      envelopeCount: 3,
      firstEnvelopeSeq: 1,
    });

    setRpcCaller(fork.instance, "panel:user", "panel");
    await fork.instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, {
      ...agenticEvent("message.completed"),
      causality: { messageId: "msg-fork" },
    });
    const afterForkAppend = await fork.instance.getReplayAfter({ after: 3 });
    expect(afterForkAppend.logEvents.map((event) => event.id)).toEqual([4]);
    // A lost initialization reply can be re-driven after child work starts.
    // The operation receipt must not truncate that independently owned tail.
    await fork.instance.postClone("channel-parent", 3, "ctx-forked");
    expect(
      (await fork.instance.getReplayAfter({ after: 3 })).logEvents,
    ).toEqual(afterForkAppend.logEvents);
    const parentTail = await parent.instance.getReplayAfter({ after: 3 });
    expect(parentTail.logEvents).toHaveLength(1);
    expect(
      (parentTail.logEvents[0]!.payload as { causality: { messageId: string } })
        .causality.messageId,
    ).toBe("msg-parent-tail");
  });

  it("forks invocation history without executing or cancelling its source-owned operation", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:owned-source";
    let finishProvider!: (value: unknown) => void;
    let beganProvider!: () => void;
    let sourceSettled!: () => void;
    const work = new Promise<unknown>((resolve) => {
      finishProvider = resolve;
    });
    const started = new Promise<void>((resolve) => {
      beganProvider = resolve;
    });
    const settled = new Promise<void>((resolve) => {
      sourceSettled = resolve;
    });
    const providerCalls: string[] = [];
    let parent!: Awaited<ReturnType<typeof createGadBackedChannel>>;
    parent = await createGadBackedChannel({
      channelKey: "running-source",
      rpcCall: async (target, method) => {
        if (target === targetPid && method === "onChannelEnvelope") return null;
        if (target === targetPid && method === "onMethodCall") {
          providerCalls.push(method);
          beganProvider();
          return work;
        }
        if (target === targetPid && method === "cancelDirectMethodCall") {
          providerCalls.push(method);
          return null;
        }
        return undefined;
      },
    });
    const sourceLog = (parent.instance as unknown as { channelLog: ChannelLog })
      .channelLog;
    const appendSource = sourceLog.append.bind(sourceLog);
    vi.spyOn(sourceLog, "append").mockImplementation(async (input) => {
      const result = await appendSource(input);
      if (input.messageId === "terminal:owned-call") sourceSettled();
      return result;
    });
    setRpcCaller(parent.instance, "panel:caller", "panel");
    await parent.instance.subscribe("panel:caller", {
      contextId: "ctx-running",
      name: "Caller",
      type: "panel",
    });
    await joinEntity(
      parent.instance,
      targetPid,
      { name: "Owner", type: "agent" },
      "ctx-running",
    );
    setRpcCaller(parent.instance, "panel:caller", "panel");
    await parent.instance.callMethod(
      "panel:caller",
      targetPid,
      "owned-call",
      "eval",
      { code: "owned work" },
      {
        invocationId: "owned-invocation",
        transportCallId: "owned-call",
      },
    );
    await started;
    const before = await parent.instance.getReplayAfter({ after: 0 });
    const child = await createGadBackedChannel({
      channelKey: "knowledge-child",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
      rpcCall: (target, method) => {
        if (
          target === targetPid &&
          (method === "onMethodCall" || method === "cancelDirectMethodCall")
        ) {
          providerCalls.push(`child:${method}`);
          throw new Error("A history fork cannot act on its source provider");
        }
        return undefined;
      },
    });
    try {
      await initializeChannelClone(child, "running-source", "ctx-knowledge");
      await child.instance.postClone(
        "running-source",
        before.ready.snapshotLastSeq!,
        "ctx-knowledge",
        {
          forkId: "knowledge-fork",
          rootChannelId: "running-source",
        },
      );
      expect(providerCalls).toEqual(["onMethodCall"]);
      expect(child.sql.exec(`SELECT * FROM pending_calls`).toArray()).toEqual(
        [],
      );
      expect(
        parent.sql.exec(`SELECT * FROM pending_calls`).toArray(),
      ).toHaveLength(1);
      expect(
        await parent.instance.getEnvelope("terminal:owned-call"),
      ).toBeNull();
      expect(
        (await child.instance.getEnvelope("terminal:owned-call"))?.payload,
      ).toMatchObject({
        kind: "invocation.abandoned",
        payload: {
          terminalOutcome: "abandoned",
          terminalReasonCode: "aborted-by-fork",
        },
      });
      finishProvider({ result: "original completed" });
      await work;
      await settled;
      expect(
        (await parent.instance.getEnvelope("terminal:owned-call"))?.payload,
      ).toMatchObject({
        kind: "invocation.completed",
        payload: { terminalOutcome: "success", result: "original completed" },
      });
      expect(
        (await child.instance.getEnvelope("terminal:owned-call"))?.payload,
      ).toMatchObject({
        kind: "invocation.abandoned",
        payload: { terminalOutcome: "abandoned" },
      });
    } finally {
      finishProvider({ result: "original completed" });
      await work;
    }
  });

  it("listForks folds this channel's own log into its direct-child fork projection", async () => {
    const selfTarget =
      "do:workers/pubsub-channel:PubSubChannel:channel-lf-parent";
    const agentTarget = "do:workers/agent-worker:AiChatWorker:agent-lf-parent";
    const clonedAgentTarget =
      "do:workers/agent-worker:AiChatWorker:agent-lf-child";
    let cloneCalls = 0;
    const lifecycleCalls: Array<{
      target: string;
      method: string;
      args: unknown[];
    }> = [];
    const parent = await createGadBackedChannel({
      channelKey: "channel-lf-parent",
      rpcCall: (target, method, args) => {
        // Sibling-channel resolve (fork parent): hand back THIS channel's own ref.
        if (
          target === "main" &&
          method === "workers.resolveService" &&
          args[0] === "vibestudio.channel.v1"
        ) {
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
            {
              source: "workers/pubsub-channel",
              name: "PubSubChannel",
              className: "PubSubChannel",
              objectKey: String(args[1]),
            },
          );
        }
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (target === agentTarget && method === "exportChannelKnowledge") {
          lifecycleCalls.push({ target, method, args });
          const request = args[0] as {
            channelId: string;
            throughSequence: number;
          };
          return {
            channelId: request.channelId,
            throughSequence: request.throughSequence,
            history: {
              source: { conversationId: 1, at: null },
              agent: {},
              entries: [],
            },
            anchors: [],
          };
        }
        // Clone the channel and its subscribed agent into a fresh context.
        if (target === "main" && method === "runtime.cloneContext") {
          cloneCalls += 1;
          return {
            contextId: "ctx-lf-fork",
            contexts: [],
            rewired: [],
            entities: [
              {
                sourceId: selfTarget,
                newId:
                  "do:workers/pubsub-channel:PubSubChannel:channel-lf-child",
                kind: "do",
                source: "workers/pubsub-channel",
                className: "PubSubChannel",
                sourceKey: "channel-lf-parent",
                newKey: "channel-lf-child",
                targetId:
                  "do:workers/pubsub-channel:PubSubChannel:channel-lf-child",
              },
              {
                sourceId: agentTarget,
                newId: clonedAgentTarget,
                kind: "do",
                source: "workers/agent-worker",
                className: "AiChatWorker",
                sourceKey: "agent-lf-parent",
                newKey: "agent-lf-child",
                targetId: clonedAgentTarget,
              },
            ],
          };
        }
        // The cloned child's postClone is driven over RPC; ack it.
        if (
          method === "postClone" ||
          method === "importChannelKnowledge" ||
          method === "runtime.rebindAgentChannel"
        ) {
          lifecycleCalls.push({ target, method, args });
          return null;
        }
        return undefined;
      },
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    await parent.instance.subscribe("panel:user", {
      contextId: "ctx-lf",
      name: "User",
      type: "panel",
    });
    setRpcCaller(parent.instance, agentTarget, "durable-object");
    await parent.instance.join({
      participantId: agentTarget,
      operationId: "join-1",
      contextId: "ctx-lf",
      metadata: { name: "Agent", type: "agent" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: agentTarget, invocation: "direct" },
      applicationConfig: null,
      replay: true,
    });
    setRpcCaller(parent.instance, "panel:user", "panel");

    expect(await parent.instance.listForks()).toEqual({
      forks: [],
      headSeq: expect.any(Number),
    });

    const forkInput = {
      operationId: "fork-operation-1",
      locus: { kind: "head" as const },
      reason: "deep dive",
      label: "My fork",
    };
    const result = await parent.instance.fork(forkInput);
    expect(result.forkedChannelId).toBe("channel-lf-child");
    await expect(parent.instance.fork(forkInput)).resolves.toEqual(result);
    expect(cloneCalls).toBe(1);
    expect(lifecycleCalls).toEqual([
      {
        target: agentTarget,
        method: "exportChannelKnowledge",
        args: [
          {
            operationId: `fork:fork-operation-1:${agentTarget}`,
            channelId: "channel-lf-parent",
            throughSequence: 2,
          },
        ],
      },
      expect.objectContaining({
        target: "do:workers/pubsub-channel:PubSubChannel:channel-lf-child",
        method: "postClone",
      }),
      {
        target: "main",
        method: "runtime.rebindAgentChannel",
        args: [{ entityId: clonedAgentTarget, channelId: "channel-lf-child" }],
      },
      expect.objectContaining({
        target: clonedAgentTarget,
        method: "importChannelKnowledge",
        args: [
          expect.objectContaining({
            parentChannelId: "channel-lf-parent",
            channelId: "channel-lf-child",
            contextId: "ctx-lf-fork",
            knowledge: expect.objectContaining({ throughSequence: 2 }),
          }),
        ],
      }),
    ]);

    const { forks } = await parent.instance.listForks();
    expect(forks).toHaveLength(1);
    expect(forks[0]).toMatchObject({
      forkId: result.forkId,
      forkedChannelId: "channel-lf-child",
      forkedContextId: "ctx-lf-fork",
      forkPointId: 2,
      label: "My fork",
      reason: "deep dive",
      archived: false,
    });

    // Rename + archive fold through the SAME projection; archived rows stay
    // (the UI filters), and rename wins.
    await parent.instance.renameFork(result.forkId, "Renamed fork");
    await parent.instance.archiveFork(result.forkId);
    const after = await parent.instance.listForks();
    expect(after.forks).toHaveLength(1);
    expect(after.forks[0]).toMatchObject({
      forkId: result.forkId,
      label: "Renamed fork",
      archived: true,
    });
  });

  it("resolves semantic message loci without trusting client sequence arithmetic", async () => {
    const { instance, sql } = await createGadBackedChannel({
      channelKey: "channel-loci",
    });
    sql.exec(
      `INSERT INTO fork_turn_loci (turn_id, opened_seq) VALUES ('turn-1', 20)`,
    );
    sql.exec(
      `INSERT INTO fork_message_loci
         (message_id, first_seq, terminal_seq, turn_id, actor_kind)
       VALUES ('assistant-1', 21, 27, 'turn-1', 'agent'),
              ('streaming-1', 30, NULL, 'turn-2', 'agent')`,
    );
    const internal = instance as unknown as {
      resolveForkRequest(request: Record<string, unknown>): Promise<{
        forkPointPubsubId: number;
        seed?: { replaces?: { messageId: string; seq: number } };
      }>;
    };

    await expect(
      internal.resolveForkRequest({
        operationId: "semantic-before-1",
        locus: { kind: "before-message", messageId: "assistant-1" },
        reason: "edit",
        seed: {
          author: { kind: "user", id: "user-1" },
          blocks: [{ type: "text", content: "revised" }],
          replaces: { messageId: "assistant-1" },
        },
      }),
    ).resolves.toMatchObject({
      forkPointPubsubId: 19,
      seed: {
        author: { kind: "system", id: "system" },
        replaces: { messageId: "assistant-1", seq: 27 },
      },
    });
    await expect(
      internal.resolveForkRequest({
        operationId: "semantic-after-1",
        locus: { kind: "after-message", messageId: "assistant-1" },
        reason: "fork",
      }),
    ).resolves.toMatchObject({ forkPointPubsubId: 27 });
    await expect(
      internal.resolveForkRequest({
        operationId: "semantic-unfinished-1",
        locus: { kind: "after-message", messageId: "streaming-1" },
        reason: "fork",
      }),
    ).rejects.toThrow(/cannot fork after unfinished message streaming-1/);
  });

  it("keeps failed fork cleanup retryable until context destruction succeeds", async () => {
    let destroyAttempts = 0;
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: (_target, method) => {
        if (method !== "runtime.destroyContext") return undefined;
        destroyAttempts += 1;
        if (destroyAttempts === 1) throw new Error("cleanup unavailable");
        return null;
      },
    });
    const now = Date.now();
    sql.exec(
      `INSERT INTO fork_ops
         (fork_id, fork_point_id, opts, phase, forked_channel_id,
          forked_context_id, created_at, updated_at)
       VALUES (?, 1, ?, 'cloned', 'child-1', 'context-child-1', ?, ?)`,
      "fork-cleanup-1",
      JSON.stringify({
        operationId: "fork-cleanup-1",
        locus: { kind: "head" },
        request: {
          operationId: "fork-cleanup-1",
          locus: { kind: "head" },
          reason: "test",
        },
        forkPointPubsubId: 1,
        reason: "test",
      }),
      now,
      now,
    );
    const internal = instance as unknown as {
      rollbackForkOp(forkId: string): Promise<void>;
    };

    await expect(internal.rollbackForkOp("fork-cleanup-1")).rejects.toThrow(
      "cleanup unavailable",
    );
    expect(sql.exec(`SELECT phase FROM fork_ops`).one()["phase"]).toBe(
      "rollback-pending",
    );
    await expect(
      internal.rollbackForkOp("fork-cleanup-1"),
    ).resolves.toBeUndefined();
    expect(sql.exec(`SELECT phase FROM fork_ops`).one()["phase"]).toBe(
      "rolledback",
    );
  });

  it("re-homes the channel's context when postClone threads a new contextId", async () => {
    const parent = await createGadBackedChannel({
      channelKey: "channel-ctx-parent",
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    await parent.instance.subscribe("panel:user", {
      contextId: "ctx-src",
      name: "User",
      type: "panel",
    });
    await parent.instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent("message.completed"),
    );

    // A true context fork re-homes the channel into a fresh isolated context.
    const fork = await createGadBackedChannel({
      channelKey: "channel-ctx-fork",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
    });
    await initializeChannelClone(fork, "channel-ctx-parent", "ctx-forked");
    await fork.instance.postClone("channel-ctx-parent", 2, "ctx-forked");
    expect(await fork.instance.getContextId()).toBe("ctx-forked");

    // Omitting the new contextId is rejected; forks always get a fresh context.
    const fork2 = await createGadBackedChannel({
      channelKey: "channel-ctx-fork2",
      gad: parent.gad,
    });
    await expect(
      (
        fork2.instance as unknown as {
          postClone(
            parentChannelId: string,
            forkPointId: number,
          ): Promise<void>;
        }
      ).postClone("channel-ctx-parent", 2),
    ).rejects.toThrow(/postClone requires newContextId/);
  });

  it("routes by transport id but publishes terminal events under the canonical invocation id", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-1",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-1",
        transportCallId: "transport-1",
        turnId: "turn-1",
      },
    );

    await instance.cancelMethodCall("panel:caller", "transport-1");

    const events = canonicalAgenticEvents(instance);
    const started = events.find(
      (event: { kind?: string }) => event.kind === "invocation.started",
    );
    const cancelled = events.find(
      (event: { kind?: string }) => event.kind === "invocation.cancelled",
    );

    expect(started).toMatchObject({
      turnId: "turn-1",
      causality: {
        invocationId: "invocation-1",
        transportCallId: "transport-1",
      },
      payload: { transport: { transportCallId: "transport-1" } },
    });
    expect(cancelled).toMatchObject({
      turnId: "turn-1",
      causality: {
        invocationId: "invocation-1",
        transportCallId: "transport-1",
      },
    });
  });

  it("lets a DO participant cancel its own call but rejects cancellation by another participant", async () => {
    const { instance } = await createGadBackedChannel({
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        return undefined;
      },
    });
    const caller = "do:vibestudio/internal:EvalDO:system-tests";

    await joinResidentSession(instance, caller, {
      name: "System tests",
      type: "headless",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });
    setRpcCaller(instance, "panel:other", "panel");
    await instance.subscribe("panel:other", {
      contextId: "ctx-1",
      name: "Other",
      type: "panel",
    });

    setRpcCaller(instance, caller, "do");
    await instance.callMethod(
      caller,
      "panel:provider",
      "transport-owned-by-do",
      "eval",
      {
        code: "await forever()",
      },
    );

    setRpcCaller(instance, "panel:other", "panel");
    await expect(
      instance.cancelMethodCall("panel:other", "transport-owned-by-do"),
    ).rejects.toThrow(/did not initiate method call/);
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter(
          (event) => event.envelopeId === "terminal:transport-owned-by-do",
        ),
    ).toHaveLength(0);

    setRpcCaller(instance, caller, "do");
    await instance.cancelMethodCall(caller, "transport-owned-by-do");
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter(
          (event) => event.envelopeId === "terminal:transport-owned-by-do",
        ),
    ).toHaveLength(1);
  });

  it("retains an authenticated cancellation before admission without fabricating a started event", async () => {
    const { instance, sql } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    const original = {
      channelId: "channel-1",
      callerId: "panel:caller",
      targetId: "panel:provider",
      invocationId: "cancel-before-start",
      transportCallId: "cancel-before-start",
      method: "eval",
      args: { code: "never executed" },
    };
    await instance.cancelMethodCall(
      original.callerId,
      original.transportCallId,
      original,
    );
    expect(await instance.getEnvelope(original.invocationId)).toBeNull();
    expect(
      (await instance.getEnvelope(`terminal:${original.transportCallId}`))
        ?.payload,
    ).toMatchObject({
      kind: "invocation.cancelled",
      actor: { id: original.callerId },
      payload: {
        terminalOutcome: "cancelled",
        admission: { kind: "not-admitted", request: original },
      },
    });
    await instance.callMethod(
      original.callerId,
      original.targetId,
      original.transportCallId,
      original.method,
      original.args,
    );
    expect(await instance.getEnvelope(original.invocationId)).toBeNull();
    expect(
      sql
        .exec(
          "SELECT 1 FROM pending_calls WHERE transport_call_id = ?",
          original.transportCallId,
        )
        .toArray(),
    ).toHaveLength(0);
    await expect(
      instance.callMethod(
        original.callerId,
        original.targetId,
        original.transportCallId,
        "different operation",
        original.args,
      ),
    ).rejects.toThrow("original request");
    await instance.cancelMethodCall(
      original.callerId,
      original.transportCallId,
      original,
    );
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter(
          (event) =>
            event.envelopeId === `terminal:${original.transportCallId}`,
        ),
    ).toHaveLength(1);
    setRpcCaller(instance, "panel:foreign", "panel");
    await instance.subscribe("panel:foreign", {
      contextId: "ctx-1",
      name: "Foreign",
      type: "panel",
    });
    await expect(
      instance.cancelMethodCall("panel:foreign", original.transportCallId, {
        ...original,
        callerId: "panel:foreign",
      }),
    ).rejects.toThrow("original channel call");
  });

  it("serializes a delayed cancellation journal with original late admission and recovers a lost accepted reply", async () => {
    const appending = deferred(),
      append = deferred();
    const originalFailure = new Error("accepted cancellation reply lost");
    const gad = await createTestDO(GadWorkspaceDO, {
      __objectKey: "workspace",
      RPC_FETCH: channelTestRpcFetch,
    });
    let loseReply = true;
    const { instance } = await createGadBackedChannel({ gad });
    const log = (instance as unknown as { channelLog: ChannelLog }).channelLog;
    const appendOwned = log.append.bind(log);
    vi.spyOn(log, "append").mockImplementation(async (input) => {
      if (
        (input.payload as { payload?: { admission?: unknown } }).payload
          ?.admission &&
        loseReply
      ) {
        loseReply = false;
        appending.resolve();
        await append.promise;
        await appendOwned(input);
        throw originalFailure;
      }
      return appendOwned(input);
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    const original = {
      channelId: "channel-1",
      callerId: "panel:caller",
      targetId: "panel:provider",
      invocationId: "late-cancelled",
      transportCallId: "late-cancelled",
      method: "eval",
      args: { code: "never executed" },
    };
    const cancelled = instance.cancelMethodCall(
      original.callerId,
      original.transportCallId,
      original,
    );
    const failure = expect(cancelled).rejects.toBe(originalFailure);
    await appending.promise;
    const late = instance.callMethod(
      original.callerId,
      original.targetId,
      original.transportCallId,
      original.method,
      original.args,
    );
    expect(await instance.getEnvelope(original.invocationId)).toBeNull();
    append.resolve();
    await failure;
    await late;
    await instance.cancelMethodCall(
      original.callerId,
      original.transportCallId,
      original,
    );
    expect(await instance.getEnvelope(original.invocationId)).toBeNull();
    expect(
      (await instance.getEnvelope(`terminal:${original.transportCallId}`))
        ?.payload,
    ).toMatchObject({
      payload: {
        terminalOutcome: "cancelled",
        admission: { kind: "not-admitted", request: original },
      },
    });
  });

  it("refuses an original cancellation of a foreign channel or changed request before any append", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    const original = {
      channelId: "channel:foreign",
      callerId: "panel:caller",
      targetId: "panel:provider",
      invocationId: "foreign-cancel",
      transportCallId: "foreign-cancel",
      method: "eval",
      args: {},
    };
    await expect(
      instance.cancelMethodCall(
        original.callerId,
        original.transportCallId,
        original,
      ),
    ).rejects.toThrow("original channel call");
    expect(
      await instance.getEnvelope(`terminal:${original.transportCallId}`),
    ).toBeNull();
  });

  it("fences a late entity provider through its actual claim and joins delivery after cancellation", async () => {
    const target = "do:workers/agent-worker:AiChatWorker:late-provider";
    const arrived = deferred(),
      admission = deferred(),
      marked = deferred(),
      cancelling = deferred();
    let effects = 0,
      accepted: boolean | undefined;
    let instance!: PubSubChannel;
    const fixture = await createGadBackedChannel({
      rpcCall: async (rpcTarget, method, args) => {
        if (method === "workspace-state.entity.resolveActive")
          return activeEntityFixture(args[0]);
        if (rpcTarget === target && method === "onMethodCall") {
          arrived.resolve();
          await admission.promise;
          setRpcCaller(instance, target, "do");
          const metadata = args[4] as { providerClaimGeneration: number };
          accepted = (
            await instance.markMethodCallExecutionStarted(
              target,
              String(args[1]),
              metadata.providerClaimGeneration,
            )
          ).accepted;
          if (accepted) effects++;
          marked.resolve();
          return { result: null };
        }
        if (rpcTarget === target && method === "cancelDirectMethodCall") {
          cancelling.resolve();
          return null;
        }
        if (method === "onChannelEnvelope") return null;
        return undefined;
      },
    });
    instance = fixture.instance;
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    await joinEntity(instance, target);
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      target,
      "late-provider-call",
      "eval",
      {},
    );
    await arrived.promise;
    let settled = false;
    const cancellation = instance
      .cancelMethodCall("panel:caller", "late-provider-call")
      .then(() => {
        settled = true;
      });
    await cancelling.promise;
    expect(settled).toBe(false);
    admission.resolve();
    await marked.promise;
    await cancellation;
    expect(accepted).toBe(false);
    expect(effects).toBe(0);
    expect(settled).toBe(true);
  });

  it("retains failed provider cancellation and joins its exact canonical route on retry", async () => {
    const target = "do:workers/agent-worker:AiChatWorker:cancel-retry";
    const started = deferred();
    const operation = deferred<unknown>();
    const joining = deferred();
    const cleanup = deferred();
    const original = new Error("original provider cleanup failure");
    const executions: unknown[][] = [];
    const cancellations: unknown[][] = [];
    const { instance, sql } = await createGadBackedChannel({
      rpcCall: (_target, method, args) => {
        if (method === "workspace-state.entity.resolveActive")
          return activeEntityFixture(args[0]);
        if (_target === target && method === "onMethodCall") {
          executions.push(args);
          started.resolve();
          return operation.promise;
        }
        if (_target === target && method === "cancelDirectMethodCall") {
          cancellations.push(args);
          if (cancellations.length === 1) throw original;
          joining.resolve();
          return cleanup.promise.then(() => {
            operation.resolve({ result: null });
            return null;
          });
        }
        if (method === "onChannelEnvelope") return null;
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:other", "panel");
    await instance.subscribe("panel:other", {
      contextId: "ctx-1",
      name: "Other",
      type: "panel",
    });
    await joinEntity(instance, target, {
      name: "Agent",
      type: "agent",
      handle: "agent",
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      target,
      "call-cleanup",
      "eval",
      { code: "owned work" },
      {
        invocationId: "invocation-cleanup",
        transportCallId: "call-cleanup",
      },
    );
    await started.promise;
    await expect(
      instance.cancelMethodCall("panel:caller", "call-cleanup"),
    ).rejects.toBe(original);
    expect(
      sql
        .exec(
          "SELECT 1 FROM pending_calls WHERE transport_call_id = ?",
          "call-cleanup",
        )
        .toArray(),
    ).toHaveLength(0);
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter((event) => event.envelopeId === "terminal:call-cleanup"),
    ).toHaveLength(1);
    setRpcCaller(instance, "panel:other", "panel");
    await expect(
      instance.cancelMethodCall("panel:other", "call-cleanup"),
    ).rejects.toThrow("did not initiate method call");
    expect(cancellations).toHaveLength(1);
    setRpcCaller(instance, "panel:caller", "panel");
    let settled = false;
    const retry = instance
      .cancelMethodCall("panel:caller", "call-cleanup")
      .then(() => {
        settled = true;
      });
    await joining.promise;
    expect(settled).toBe(false);
    cleanup.resolve();
    await retry;
    expect(cancellations).toEqual([
      [expect.any(String), "call-cleanup"],
      [expect.any(String), "call-cleanup"],
    ]);
    expect(executions).toHaveLength(1);
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter((event) => event.envelopeId === "terminal:call-cleanup"),
    ).toHaveLength(1);
  });

  it("reconstructs pending_calls during cancelMethodCall before dropping (cache-cold)", async () => {
    const { instance, sql } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-cancel-cold",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-cancel-cold",
        transportCallId: "transport-cancel-cold",
        turnId: "turn-cancel-cold",
      },
    );

    // Simulate a cache-cold row (post-eviction): the durable started survives,
    // the SQLite cache row is gone. A cancel must reconcile and still settle.
    sql.exec(
      `DELETE FROM pending_calls WHERE transport_call_id = ?`,
      "transport-cancel-cold",
    );

    await instance.cancelMethodCall("panel:caller", "transport-cancel-cold");

    const cancelled = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "terminal:transport-cancel-cold");
    expect(cancelled).toHaveLength(1);
  });

  it("settles an expired timed call through a host-held deadline claim", async () => {
    const { instance, sql } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-timed",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-timed",
        transportCallId: "transport-timed",
        turnId: "turn-timed",
        timeoutMs: 60_000,
      },
    );

    const row = sql
      .exec(
        `SELECT deadline_at FROM pending_calls WHERE transport_call_id = ?`,
        "transport-timed",
      )
      .toArray()[0] as { deadline_at: number | null } | undefined;
    expect(row?.deadline_at).toEqual(expect.any(Number));

    sql.exec(
      `UPDATE pending_calls SET deadline_at = ? WHERE transport_call_id = ?`,
      Date.now() - 1,
      "transport-timed",
    );
    await instance.alarm();
    const [claim] = instance.claimReadyWork("channel-delivery", {
      workerId: "test-host",
      now: Date.now(),
      limit: 1,
    });
    expect(claim?.itemId).toBe("maintenance:call-deadline:transport-timed");
    const outcome = await instance.executeChannelMaintenanceClaim({
      itemId: claim!.itemId,
      generation: claim!.generation,
    });
    expect(
      instance.settleReadyWork("channel-delivery", {
        workerId: "test-host",
        itemId: claim!.itemId,
        generation: claim!.generation,
        outcome,
      }),
    ).toBe("accepted");

    expect(
      sql
        .exec(
          `SELECT 1 FROM pending_calls WHERE transport_call_id = ?`,
          "transport-timed",
        )
        .toArray(),
    ).toEqual([]);
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter((event) => event.envelopeId === "terminal:transport-timed"),
    ).toHaveLength(1);
  });

  it("does not use the durable alarm as a stale pending-call redelivery loop", async () => {
    const emitted: unknown[] = [];
    const { instance, sql } = await createGadBackedChannel({ emitted });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-redelivery",
      "slow_method",
      { value: 1 },
      {
        invocationId: "invocation-redelivery",
        transportCallId: "transport-redelivery",
      },
    );
    sql.exec(
      `UPDATE pending_calls SET created_at = ? WHERE transport_call_id = ?`,
      Date.now() - 60_000,
      "transport-redelivery",
    );
    emitted.length = 0;

    await instance.alarm();

    expect(
      emitted.some((payload) => {
        const message = (payload as { message?: { payload?: AgenticEvent } })
          .message;
        return (
          message?.payload?.causality?.transportCallId ===
          "transport-redelivery"
        );
      }),
    ).toBe(false);
    expect(
      sql
        .exec(
          `SELECT 1 FROM pending_calls WHERE transport_call_id = ?`,
          "transport-redelivery",
        )
        .toArray(),
    ).toHaveLength(1);
  });

  it("does not re-enter an agent method from a stale-call alarm sweep", async () => {
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-redelivery";
    const methodCalls: unknown[][] = [];
    const emitted: unknown[] = [];
    const { instance, sql } = await createGadBackedChannel({
      emitted,
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (target === targetPid && method === "onChannelEnvelope") return null;
        if (target === targetPid && method === "onMethodCall") {
          methodCalls.push(args);
          return new Promise(() => {});
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    await joinEntity(instance, targetPid);
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      targetPid,
      "transport-agent-redelivery",
      "slow_method",
      { value: 1 },
      {
        invocationId: "invocation-agent-redelivery",
        transportCallId: "transport-agent-redelivery",
      },
    );
    expect(methodCalls).toHaveLength(1);
    sql.exec(
      `UPDATE pending_calls SET created_at = ? WHERE transport_call_id = ?`,
      Date.now() - 60_000,
      "transport-agent-redelivery",
    );
    emitted.length = 0;

    await instance.alarm();

    expect(methodCalls).toHaveLength(1);
    expect(
      emitted.some((payload) => {
        const message = (payload as { message?: { payload?: AgenticEvent } })
          .message;
        return (
          message?.payload?.causality?.transportCallId ===
          "transport-agent-redelivery"
        );
      }),
    ).toBe(false);
  });

  it("settles pending method calls as an error from malformed terminal invocation events", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-malformed",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-malformed",
        transportCallId: "transport-malformed",
        turnId: "turn-malformed",
      },
    );

    // The publish is still rejected loudly so the producer sees its bug...
    setRpcCaller(instance, "panel:provider", "panel");
    await expect(
      instance.publish("panel:provider", AGENTIC_EVENT_PAYLOAD_KIND, {
        kind: "invocation.failed",
        actor: { kind: "panel", id: "panel:provider" },
        turnId: "turn-malformed",
        causality: {
          invocationId: "invocation-malformed",
          transportCallId: "transport-malformed",
        },
        // schema rejection fixture: terminalOutcome is intentionally omitted
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          reason: "malformed terminal event",
        },
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/terminalOutcome/u);

    // Invocation events are display/history only now; malformed terminal logs
    // are rejected but no longer settle method transport.
    const pending = (
      instance as unknown as {
        sql: { exec: (...args: unknown[]) => { toArray(): unknown[] } };
      }
    ).sql
      .exec(
        `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
        "transport-malformed",
      )
      .toArray();
    expect(pending).toHaveLength(1);
  });

  it("settles pending method calls from submitMethodResult", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-ok",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-ok",
        transportCallId: "transport-ok",
        turnId: "turn-ok",
      },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.submitMethodResult(
      "panel:provider",
      "transport-ok",
      2,
      false,
      {
        invocationId: "invocation-ok",
        turnId: "turn-ok",
        terminalOutcome: "success",
      },
    );

    const pending = (
      instance as unknown as {
        sql: { exec: (...args: unknown[]) => { toArray(): unknown[] } };
      }
    ).sql
      .exec(
        `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
        "transport-ok",
      )
      .toArray();
    expect(pending).toHaveLength(0);
  });

  it("reconstructs pending_calls during submitMethodResult before dropping a result", async () => {
    const { instance, sql } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-cache-race",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-cache-race",
        transportCallId: "transport-cache-race",
        turnId: "turn-cache-race",
      },
    );

    sql.exec(
      `DELETE FROM pending_calls WHERE transport_call_id = ?`,
      "transport-cache-race",
    );

    setRpcCaller(instance, "panel:provider", "panel");
    const result = await instance.submitMethodResult(
      "panel:provider",
      "transport-cache-race",
      2,
      false,
      {
        invocationId: "invocation-cache-race",
        turnId: "turn-cache-race",
        terminalOutcome: "success",
      },
    );

    expect(result.id).toEqual(expect.any(Number));
    expect(
      sql
        .exec(
          `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
          "transport-cache-race",
        )
        .toArray(),
    ).toHaveLength(0);
    const terminals = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "terminal:transport-cache-race");
    expect(terminals).toHaveLength(1);
  });

  it("reconstructs agent-loop channel calls whose transport id lives in payload.transport", async () => {
    const { instance, sql } = await createGadBackedChannel();

    setRpcCaller(instance, "do:agent", "durable-object");
    await instance.subscribe("do:agent", {
      contextId: "ctx-1",
      name: "Agent",
      type: "agent",
    });
    setRpcCaller(instance, "do:eval", "durable-object");
    await instance.subscribe("do:eval", {
      contextId: "ctx-1",
      name: "Headless",
      type: "headless",
    });

    await (
      instance as unknown as { channelLog: ChannelLog }
    ).channelLog.appendPrepared({
      appendedAt: "2026-10-10T00:00:00.000Z",
      envelopeId: "invocation-agent-loop",
      actor: { kind: "agent", id: "do:agent", participantId: "do:agent" },
      payloadKind: "invocation.started",
      annotations: { contentClass: "internal", externalKeys: [] },
      causality: {
        turnId: "turn-agent-loop",
        invocationId: "invocation-agent-loop" as InvocationId,
        modelToolCallId: "invocation-agent-loop",
      },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        name: "set_title",
        invocationType: "panel",
        request: {
          protocol: "vibestudio.blob-ref.v1",
          digest: "a".repeat(64),
          size: 35,
          encoding: "json",
          originalBytes: 35,
        },
        transport: {
          kind: "channel",
          channelId: "channel-1",
          target: {
            kind: "user",
            id: "do:eval",
            participantId: "do:eval",
          },
          transportCallId: "transport-agent-loop",
        },
        userVisible: true,
      },
    });

    const { inserted } = await instance.reconcilePendingCalls(true);
    expect(inserted).toBe(1);
    expect(
      sql
        .exec(
          `SELECT transport_call_id, invocation_id, method FROM pending_calls WHERE transport_call_id = ?`,
          "transport-agent-loop",
        )
        .toArray(),
    ).toEqual([
      expect.objectContaining({
        transport_call_id: "transport-agent-loop",
        invocation_id: "invocation-agent-loop",
        method: "set_title",
      }),
    ]);

    setRpcCaller(instance, "do:eval", "durable-object");
    const result = await instance.submitMethodResult(
      "do:eval",
      "transport-agent-loop",
      {
        ok: true,
      },
      false,
      {
        invocationId: "invocation-agent-loop",
        turnId: "turn-agent-loop",
        terminalOutcome: "success",
      },
    );

    expect(result).toEqual({ id: expect.any(Number) });
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter((event) => event.envelopeId === "invocation-agent-loop"),
    ).toHaveLength(1);
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter(
          (event) => event.envelopeId === "terminal:transport-agent-loop",
        ),
    ).toHaveLength(1);
  });

  it("recovers a lost call: appends a terminal when a result has no pending row and no started", async () => {
    const emitted: unknown[] = [];
    const { instance } = await createGadBackedChannel({ emitted });

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    // No call was ever journaled for this transportCallId (cache-cold / lost
    // started record): reconcile finds nothing and there is no durable terminal.
    // Dropping the result would strand the caller forever — its parked
    // invocation only settles on a terminal carrying the same invocationId. So
    // the channel must ROOT the method and append a real terminal instead of a
    // silent no-op.
    setRpcCaller(instance, "panel:provider", "panel");
    const result = await instance.submitMethodResult(
      "panel:provider",
      "transport-lost-record",
      42,
      false,
      { invocationId: "invocation-lost-record", turnId: "turn-lost-record" },
    );

    // The submitter still gets an observability signal, but it is a RECOVERY,
    // not a drop — a real terminal seq id is returned.
    expect(result).toMatchObject({
      id: expect.any(Number),
      dropped: false,
      recovered: true,
    });

    // A durable terminal event now exists, keyed on the transportCallId and
    // carrying the caller's invocationId (what routeInvocationTerminal matches).
    const terminalRow = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "terminal:transport-lost-record");
    expect(terminalRow).toHaveLength(1);
    expect(
      canonicalAgenticEvent(instance, "terminal:transport-lost-record"),
    ).toMatchObject({
      kind: "invocation.completed",
      causality: {
        invocationId: "invocation-lost-record",
        transportCallId: "transport-lost-record",
      },
      payload: { result: 42, terminalOutcome: "success" },
    });

    // No synthetic `started` is appended: the lost request's method and args
    // are unavailable, so inventing an admission would corrupt the log.
    const rootRow = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "invocation-lost-record");
    expect(rootRow).toHaveLength(0);

    // The terminal is broadcast so subscribers (the caller) actually receive it.
    // The wire shape is { channelId, message: { kind: "log", event } } — the
    // invocation payload lives at message.event.payload.
    const broadcastCompleted = emitted
      .map(
        (payload) =>
          (
            payload as {
              message?: {
                event?: {
                  payload?: {
                    kind?: string;
                    causality?: { transportCallId?: string };
                  };
                };
              };
            }
          ).message?.event?.payload,
      )
      .find(
        (agentic) =>
          agentic?.kind === "invocation.completed" &&
          agentic?.causality?.transportCallId === "transport-lost-record",
      );
    expect(broadcastCompleted).toBeDefined();
  });

  it("recovers a lost call as invocation.failed when the submission isError", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:provider", "panel");
    const result = await instance.submitMethodResult(
      "panel:provider",
      "transport-lost-error",
      "boom",
      true,
      { invocationId: "invocation-lost-error" },
    );
    expect(result).toMatchObject({
      id: expect.any(Number),
      dropped: false,
      recovered: true,
    });

    const terminal = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "terminal:transport-lost-error");
    expect(terminal).toHaveLength(1);
    expect(
      canonicalAgenticEvent(instance, "terminal:transport-lost-error"),
    ).toMatchObject({
      kind: "invocation.failed",
      causality: { invocationId: "invocation-lost-error" },
      payload: { terminalOutcome: "tool_error" },
    });
  });

  it("settles via the NORMAL path when a result races an in-flight started append (no recovery)", async () => {
    // Root-cause durability case: callMethod journals the `started` to GAD
    // (a cross-DO RPC) BEFORE inserting the cache row. If a submitMethodResult
    // for the same transportCallId arrives WHILE that append is in flight, the
    // call exists in neither the cache (insertRow hasn't run) nor a committed
    // durable log a forced reconcile can re-derive it from. Without the
    // start-journaling barrier the submit fell through to settleMissingCall —
    // synthesizing a SECOND (synthetic) started + terminal instead of settling
    // against the canonical one (the observed "recovered a lost call" log).
    //
    // With the barrier, submit waits for the canonical started to commit, then
    // settles via the normal pending path: exactly one started, one terminal,
    // and result.recovered is never set.
    const blockStarted = deferred();
    let blockedOnce = false;
    const gad = await createTestDO(GadWorkspaceDO, {
      __objectKey: "workspace",
    });
    const { instance } = await createGadBackedChannel({ gad });
    const log = (instance as unknown as { channelLog: ChannelLog }).channelLog;
    const appendOwned = log.append.bind(log);
    vi.spyOn(log, "append").mockImplementation(async (input) => {
      if (
        !blockedOnce &&
        (input.payload as { kind?: string }).kind === "invocation.started"
      ) {
        blockedOnce = true;
        await blockStarted.promise;
      }
      return appendOwned(input);
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    // Fire callMethod; it parks inside the blocked `started` append.
    setRpcCaller(instance, "panel:caller", "panel");
    const callPromise = instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-start-race",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-start-race",
        transportCallId: "transport-start-race",
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    // The result arrives while the start is mid-append. It must NOT recover —
    // it parks on the in-flight barrier until the canonical started commits.
    setRpcCaller(instance, "panel:provider", "panel");
    const submitPromise = instance.submitMethodResult(
      "panel:provider",
      "transport-start-race",
      99,
      false,
      { invocationId: "invocation-start-race" },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Release the started append; both the call and the parked submit drain.
    blockStarted.resolve();
    const result = await submitPromise;
    await callPromise;

    // Settled via the NORMAL path — no lost-call recovery.
    expect(result.id).toEqual(expect.any(Number));
    expect(result.recovered).toBeUndefined();

    // Exactly one canonical started (envelopeId = invocationId) and one
    // terminal; no synthetic root was appended.
    const started = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "invocation-start-race");
    expect(started).toHaveLength(1);
    const startedEvents = canonicalAgenticEvents(instance);
    expect(
      startedEvents.filter((e) => e.kind === "invocation.started"),
    ).toHaveLength(1);
    expect(
      startedEvents.filter((e) => e.kind === "invocation.completed"),
    ).toHaveLength(1);
    const terminal = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId === "terminal:transport-start-race");
    expect(terminal).toHaveLength(1);

    // The cache row is consumed.
    expect(
      (
        instance as unknown as {
          sql: { exec: (...args: unknown[]) => { toArray(): unknown[] } };
        }
      ).sql
        .exec(
          `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
          "transport-start-race",
        )
        .toArray(),
    ).toHaveLength(0);
  });

  it("appends a durable invocation.completed terminal (no method-result envelope)", async () => {
    const emitted: unknown[] = [];
    const { instance } = await createGadBackedChannel({ emitted });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-envelope",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-envelope",
        transportCallId: "transport-envelope",
        turnId: "turn-envelope",
      },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.submitMethodResult(
      "panel:provider",
      "transport-envelope",
      2,
      false,
      {
        invocationId: "invocation-envelope",
        turnId: "turn-envelope",
        terminalOutcome: "success",
        attachments: [
          { id: "att-1", data: "AA==", mimeType: "text/plain", size: 1 },
        ],
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    // No method-* wire envelope is emitted anymore.
    const methodEnvelope = emitted
      .map((payload) => (payload as { message?: { kind?: string } }).message)
      .find(
        (message) =>
          typeof message?.kind === "string" &&
          message.kind.startsWith("method-"),
      );
    expect(methodEnvelope).toBeUndefined();

    // The canonical terminal is a durable invocation.completed log event,
    // carrying the result and the attachment on the envelope.
    const envelopes = canonicalLedger(instance).read({
      limit: Number.MAX_SAFE_INTEGER,
    });
    const completed = envelopes.find(
      (row) => row.payloadKind === "invocation.completed",
    );
    expect(completed).toBeDefined();
    expect(
      canonicalAgenticEvent(instance, completed!.envelopeId),
    ).toMatchObject({
      kind: "invocation.completed",
      causality: { transportCallId: "transport-envelope" },
      payload: { result: 2, terminalOutcome: "success" },
    });
    expect(completed!.annotations).toMatchObject({
      attachments: [{ id: "att-1", mimeType: "text/plain" }],
    });
  });

  it("appends a durable invocation.cancelled on cancel and drops late submits", async () => {
    const emitted: unknown[] = [];
    const { instance } = await createGadBackedChannel({ emitted });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-cancel-envelope",
      "eval",
      { code: "await forever()" },
      {
        invocationId: "invocation-cancel-envelope",
        transportCallId: "transport-cancel-envelope",
        turnId: "turn-cancel-envelope",
      },
    );

    await instance.cancelMethodCall(
      "panel:caller",
      "transport-cancel-envelope",
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    // No method-* wire envelope — provider abort derives from invocation.cancelled.
    const methodEnvelope = emitted
      .map((payload) => (payload as { message?: { kind?: string } }).message)
      .find(
        (message) =>
          typeof message?.kind === "string" &&
          message.kind.startsWith("method-"),
      );
    expect(methodEnvelope).toBeUndefined();

    // Durable invocation.cancelled terminal.
    const cancelled = canonicalAgenticEvents(instance).find(
      (ev) => ev.kind === "invocation.cancelled",
    );
    expect(cancelled).toMatchObject({
      kind: "invocation.cancelled",
      causality: { transportCallId: "transport-cancel-envelope" },
      payload: expect.objectContaining({ terminalOutcome: "cancelled" }),
    });

    // The call is consumed: a late terminal is idempotently acknowledged with
    // the existing terminal id, and late progress is a no-op.
    setRpcCaller(instance, "panel:provider", "panel");
    const terminalCountBefore = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.envelopeId.startsWith("terminal:")).length;
    await expect(
      instance.submitMethodResult(
        "panel:provider",
        "transport-cancel-envelope",
        "late",
        false,
      ),
    ).resolves.toEqual({ id: expect.any(Number) });
    expect(
      canonicalLedger(instance)
        .read({ limit: Number.MAX_SAFE_INTEGER })
        .filter((event) => event.envelopeId.startsWith("terminal:")).length,
    ).toBe(terminalCountBefore);
    await expect(
      instance.submitMethodProgress(
        "panel:provider",
        "transport-cancel-envelope",
        "late progress",
      ),
    ).resolves.toBeUndefined();
  });

  it("appends a durable invocation.output for a pending call and no-ops once consumed", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-output",
      "eval",
      { code: "stream()" },
      {
        invocationId: "invocation-output",
        transportCallId: "transport-output",
        turnId: "turn-output",
      },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.submitMethodProgress(
      "panel:provider",
      "transport-output",
      "chunk-1",
    );

    const output = canonicalAgenticEvents(instance).find(
      (ev) => ev.kind === "invocation.output",
    );
    // Progress chunks are class-REFERENCE (storage classes: fold-opaque
    // streaming bulk is ALWAYS a ref, even when tiny — one code path).
    expect(output).toMatchObject({
      kind: "invocation.output",
      causality: { transportCallId: "transport-output" },
      payload: {
        output: { protocol: "vibestudio.blob-ref.v1", encoding: "text" },
      },
    });

    // Consume the call, then a late progress chunk is a quiet no-op (not appended).
    await instance.submitMethodResult(
      "panel:provider",
      "transport-output",
      "done",
      false,
    );
    await expect(
      instance.submitMethodProgress(
        "panel:provider",
        "transport-output",
        "chunk-2",
      ),
    ).resolves.toBeUndefined();
    const outputs = canonicalAgenticEvents(instance).filter(
      (ev) => ev.kind === "invocation.output",
    );
    expect(outputs).toHaveLength(1);
  });

  it("rejects method result and progress submissions from non-target participants", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });
    setRpcCaller(instance, "panel:intruder", "panel");
    await instance.subscribe("panel:intruder", {
      contextId: "ctx-1",
      name: "Intruder",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-guarded",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-guarded",
        transportCallId: "transport-guarded",
        turnId: "turn-guarded",
      },
    );

    setRpcCaller(instance, "panel:intruder", "panel");
    await expect(
      instance.submitMethodResult(
        "panel:intruder",
        "transport-guarded",
        99,
        false,
      ),
    ).rejects.toThrow(/not target/u);
    await expect(
      instance.submitMethodProgress(
        "panel:intruder",
        "transport-guarded",
        "still working",
      ),
    ).rejects.toThrow(/not target/u);

    setRpcCaller(instance, "panel:provider", "panel");
    await expect(
      instance.submitMethodResult(
        "panel:provider",
        "transport-guarded",
        2,
        false,
        {
          invocationId: "invocation-guarded",
          turnId: "turn-guarded",
        },
      ),
    ).resolves.toEqual({ id: expect.any(Number) });
  });

  // A terminal with no live pending call (already consumed / unknown) is dropped:
  // the canonical terminal is already in the durable log from the original settle.
  it("drops a method result with no live pending call", async () => {
    const { instance } = await createGadBackedChannel();
    const worker = instance as unknown as {
      handleMethodResult(
        callId: string,
        content: unknown,
        isError: boolean,
        outcome?: string,
        reason?: string,
      ): Promise<number | undefined>;
    };

    const id = await worker.handleMethodResult(
      "transport-orphan",
      { value: 42 },
      false,
      "success",
    );
    expect(id).toBeUndefined();

    // No invocation.* terminal is appended for an unknown call.
    const orphan = canonicalAgenticEvents(instance).find(
      (ev) => ev.causality?.transportCallId === "transport-orphan",
    );
    expect(orphan).toBeUndefined();
  });

  // A target leaving appends a durable invocation.abandoned terminal so a
  // hibernated caller recovers the outcome from replay instead of hanging.
  it("appends a durable invocation.abandoned terminal when the target leaves", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-left",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-left",
        transportCallId: "transport-left",
        turnId: "turn-left",
      },
    );

    const worker = instance as unknown as {
      failPendingCallsTargeting(
        targetId: string,
        reason: "graceful" | "disconnect" | "replaced",
      ): Promise<void>;
    };
    await worker.failPendingCallsTargeting("panel:provider", "disconnect");

    const abandoned = canonicalAgenticEvents(instance).find(
      (ev) =>
        ev.kind === "invocation.abandoned" &&
        ev.causality?.transportCallId === "transport-left",
    );
    expect(abandoned).toBeDefined();
  });

  it("settles pending method calls from abandoned method results", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-abandoned",
      "eval",
      { code: "await forever()" },
      {
        invocationId: "invocation-abandoned",
        transportCallId: "transport-abandoned",
        turnId: "turn-abandoned",
      },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    const result = await instance.submitMethodResult(
      "panel:provider",
      "transport-abandoned",
      "runner restarted",
      true,
      {
        invocationId: "invocation-abandoned",
        turnId: "turn-abandoned",
        terminalOutcome: "abandoned",
        terminalReasonCode: "runner_restarted_before_invocation_completed",
      },
    );

    expect(result.id).toBeTypeOf("number");
    const pending = (
      instance as unknown as {
        sql: { exec: (...args: unknown[]) => { toArray(): unknown[] } };
      }
    ).sql
      .exec(
        `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
        "transport-abandoned",
      )
      .toArray();
    expect(pending).toHaveLength(0);

    const events = (await instance.getReplayAfter({ after: 0 })).logEvents.map(
      (event) => event.payload as { kind?: string; payload?: unknown },
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.abandoned",
          payload: expect.objectContaining({
            terminalOutcome: "abandoned",
            terminalReasonCode: "runner_restarted_before_invocation_completed",
          }),
        }),
      ]),
    );
    expect(events.some((event) => event.kind === "invocation.failed")).toBe(
      false,
    );
  });

  it("preserves cancelled outcome when provider cancellation settles a pending method call", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-cancelled",
      "eval",
      { code: "await forever()" },
      {
        invocationId: "invocation-cancelled",
        transportCallId: "transport-cancelled",
        turnId: "turn-cancelled",
      },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    const result = await instance.submitMethodResult(
      "panel:provider",
      "transport-cancelled",
      "cancelled",
      true,
      {
        invocationId: "invocation-cancelled",
        turnId: "turn-cancelled",
        terminalOutcome: "cancelled",
        terminalReasonCode: "cancelled",
      },
    );

    expect(result.id).toBeTypeOf("number");
    const events = (await instance.getReplayAfter({ after: 0 })).logEvents.map(
      (event) => event.payload as { kind?: string; payload?: unknown },
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.cancelled",
          payload: expect.objectContaining({
            terminalOutcome: "cancelled",
            terminalReasonCode: "cancelled",
          }),
        }),
      ]),
    );
    expect(events.some((event) => event.kind === "invocation.failed")).toBe(
      false,
    );
  });

  it("joins an in-flight DO cancellation while unrelated channel work progresses", async () => {
    let resolveMethod!: (value: unknown) => void;
    let resolveMethodStarted!: () => void;
    const methodStarted = new Promise<void>((resolve) => {
      resolveMethodStarted = resolve;
    });
    const methodResult = new Promise<unknown>((resolve) => {
      resolveMethod = resolve;
    });
    let methodStartedRecorded = false;
    const cancellationDelivered = deferred();
    const targetPid = "do:workers/agent-worker:AiChatWorker:agent-1";
    const channel = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workspace-state.entity.resolveActive"
        ) {
          return activeEntityFixture(args[0]);
        }
        if (target === targetPid && method === "onChannelEnvelope") return null;
        if (target === targetPid && method === "onMethodCall") {
          const admission = args[4] as { providerClaimGeneration: number };
          await expect(
            channel.callAs(
              { callerId: targetPid, callerKind: "do" },
              "markMethodCallExecutionStarted",
              targetPid,
              args[1],
              admission.providerClaimGeneration,
            ),
          ).resolves.toEqual({ accepted: true });
          if (!methodStartedRecorded) {
            methodStartedRecorded = true;
            resolveMethodStarted();
          }
          return methodResult;
        }
        if (target === targetPid && method === "cancelDirectMethodCall") {
          cancellationDelivered.resolve();
          return null;
        }
        return undefined;
      },
    });
    const { instance } = channel;

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    await joinEntity(instance, targetPid, {
      name: "Agent",
      type: "agent",
      handle: "agent",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      targetPid,
      "transport-do",
      "eval",
      { code: "while (true) {}" },
      {
        invocationId: "invocation-do",
        transportCallId: "transport-do",
        turnId: "turn-do",
      },
    );
    await methodStarted;

    setRpcCaller(instance, "panel:caller", "panel");
    let cancelled = false;
    const cancellation = instance
      .cancelMethodCall("panel:caller", "transport-do")
      .then(() => {
        cancelled = true;
      });
    await cancellationDelivered.promise;
    try {
      expect(cancelled).toBe(false);
      const published = await instance.publish(
        "panel:caller",
        AGENTIC_EVENT_PAYLOAD_KIND,
        { ...agenticEvent(), actor: { kind: "panel", id: "panel:caller" } },
        { idempotencyKey: "independent-work-during-cancellation" },
      );
      expect(
        (await instance.getEnvelope("ik:independent-work-during-cancellation"))
          ?.id,
      ).toBe(published.id);
      expect(cancelled).toBe(false);
    } finally {
      resolveMethod({ result: { ok: true } });
      await cancellation;
    }

    const events = canonicalAgenticEvents(instance);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.started",
          causality: {
            invocationId: "invocation-do",
            transportCallId: "transport-do",
          },
        }),
        expect.objectContaining({
          kind: "invocation.cancelled",
          causality: {
            invocationId: "invocation-do",
            transportCallId: "transport-do",
          },
          payload: expect.objectContaining({
            terminalOutcome: "cancelled",
            terminalReasonCode: "cancelled",
          }),
        }),
      ]),
    );
    expect(
      events.some(
        (event: { kind?: string }) => event.kind === "invocation.completed",
      ),
    ).toBe(false);
  });

  it("persists method terminal events even when the caller participant has left", async () => {
    const { instance } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-left",
      "eval",
      { code: "1 + 1" },
      {
        invocationId: "invocation-left",
        transportCallId: "transport-left",
        turnId: "turn-left",
      },
    );
    await closeTestSubscription(instance, "panel:caller", "panel:caller");

    const resultId = await instance.handleMethodResult(
      "transport-left",
      { ok: true },
      false,
    );

    expect(resultId).toBeTypeOf("number");
    const events = canonicalAgenticEvents(instance);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "invocation.started",
          turnId: "turn-left",
          causality: {
            invocationId: "invocation-left",
            transportCallId: "transport-left",
          },
        }),
        expect.objectContaining({
          kind: "invocation.completed",
          turnId: "turn-left",
          causality: {
            invocationId: "invocation-left",
            transportCallId: "transport-left",
          },
          payload: expect.objectContaining({
            protocol: AGENTIC_PROTOCOL_VERSION,
            terminalOutcome: "success",
          }),
        }),
      ]),
    );
  });

  it("spills oversized method results to a blob ref on the durable terminal", async () => {
    const { instance, blobs } = await createGadBackedChannel();

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "transport-large",
      "eval",
      { code: "huge()" },
      {
        invocationId: "invocation-large",
        transportCallId: "transport-large",
        turnId: "turn-large",
      },
    );

    await instance.handleMethodResult(
      "transport-large",
      { text: "x".repeat(80 * 1024) },
      false,
    );

    const events = canonicalAgenticEvents(instance);
    const completed = events.find(
      (event: { kind?: string; causality?: { invocationId?: string } }) =>
        event.kind === "invocation.completed" &&
        event.causality?.invocationId === "invocation-large",
    );
    // The channel-log store's generic encoder spills the oversized result to a
    // blob ref on the durable event; the blob holds the real content (no
    // method-specific "capped/omitted" wrapper).
    const resultRef = eventKindSchemas["invocation.completed"].parse(completed)
      .payload.result as { digest?: string } | undefined;
    expect(resultRef).toMatchObject({
      protocol: "vibestudio.blob-ref.v1",
      digest: expect.any(String),
      encoding: "json",
    });
    const storedResult = JSON.parse(blobs.get(resultRef!.digest!)!);
    expect(storedResult).toMatchObject({ text: "x".repeat(80 * 1024) });
    expect(JSON.stringify(completed).length).toBeLessThan(1_000);
  });

  it("reads canonical local message types before global observation", async () => {
    const { instance, gad } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });

    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      messageTypeRegisteredEvent(
        "weather",
        "export default function Weather() { return null; }",
        {
          react: "latest",
          "react/jsx-runtime": "latest",
        },
      ),
    );
    await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      messageTypeRegisteredEvent(
        "calendar",
        "export default function Calendar() { return null; }",
      ),
    );

    await expect(
      gad.call("getMessageType", {
        channelId: "channel-1",
        typeId: "weather",
      }),
    ).resolves.toBeNull();
    const storedWeather = canonicalLedger(instance)
      .registryEvents()
      .map((event) => event.payload as Record<string, unknown>)
      .find((payload) => payload["typeId"] === "weather");
    expect(storedWeather).toMatchObject({
      source: { protocol: "vibestudio.blob-ref.v1", encoding: "json" },
      imports: { protocol: "vibestudio.blob-ref.v1", encoding: "json" },
    });

    await expect(instance.getMessageTypes()).resolves.toEqual([
      expect.objectContaining({ typeId: "calendar" }),
      expect.objectContaining({
        typeId: "weather",
        source: {
          type: "code",
          code: "export default function Weather() { return null; }",
        },
        imports: { react: "latest", "react/jsx-runtime": "latest" },
      }),
    ]);
  });

  it("rejects malformed message type registry events instead of persisting plain log rows", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });

    await expect(
      instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, {
        kind: "messageType.registered",
        actor: { kind: "panel", id: "panel:user" },
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          typeId: "broken",
          displayMode: "bad",
          source: {
            type: "code",
            code: "export default function Broken() { return null; }",
          },
        },
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/payload invalid/u);

    expect(
      canonicalAgenticEvents(instance).map((event) => event.kind),
    ).not.toContain("messageType.registered");
  });
});

describe("PubSubChannel policy folds and cache amnesia (WS2)", () => {
  function agentCompleted(
    messageId: string,
    extraCausality: Record<string, unknown> = {},
  ) {
    return {
      kind: "message.completed",
      actor: { kind: "agent", id: "agent:one" },
      causality: { messageId, ...extraCausality },
      payload: {
        protocol: "agentic.trajectory.v1",
        role: "assistant",
        blocks: [
          { blockId: `${messageId}:block:0`, type: "text", content: "reply" },
        ],
        outcome: "completed",
      },
      createdAt: "2026-05-20T12:00:00.000Z",
    };
  }

  it("avoids empty policy scans at the exact owner head and still rebuilds a missing or stale cache", async () => {
    const { instance, sql } = await createGadBackedChannel();
    const log = (instance as unknown as { channelLog: ChannelLog }).channelLog;
    const read = vi.spyOn(log, "read");
    const empty = await instance.getPolicyState();
    expect(empty.foldedThroughSeq).toBe(0);
    expect(read).not.toHaveBeenCalled();

    await log.append({
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload: agentCompleted("uncached-policy-event"),
      senderId: "agent:one",
      contentClass: "internal",
      externalKeys: [],
    });
    const caughtUp = await instance.getPolicyState();
    expect(caughtUp.foldedThroughSeq).toBe(log.ledger.headSequence());
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    expect(await instance.getPolicyState()).toEqual(caughtUp);
    expect(read).not.toHaveBeenCalled();

    sql.exec("DELETE FROM state WHERE key LIKE 'policy_state:%'");
    expect(await instance.getPolicyState()).toEqual(caughtUp);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("avoids empty delivery scans at the exact owner head and catches up a stale projection", async () => {
    const { instance, sql } = await createGadBackedChannel();
    const participantId = "do:workers/agent-worker:AiChatWorker:exact-head";
    await joinEntity(instance, participantId);
    const log = (instance as unknown as { channelLog: ChannelLog }).channelLog;
    const read = vi.spyOn(log, "readEvents");
    expect(await instance.relationshipState(participantId)).toEqual({
      revision: 1,
      active: true,
    });
    expect(read).not.toHaveBeenCalled();

    sql.exec(
      "UPDATE channel_delivery_projection_cursor SET log_sequence = ? WHERE singleton = 1",
      log.ledger.headSequence() - 1,
    );
    expect(await instance.relationshipState(participantId)).toEqual({
      revision: 1,
      active: true,
    });
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    expect(await instance.relationshipState(participantId)).toEqual({
      revision: 1,
      active: true,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("stamps agentHops into annotations without mutating the payload", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "agent:one", "server");
    await instance.subscribe("agent:one", {
      contextId: "ctx-1",
      name: "Agent",
      type: "agent",
    });

    await instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-a1"),
    );
    await instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-a2"),
    );

    const rows = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.payloadKind === "message.completed");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.annotations).toMatchObject({
      agentHops: 1,
    });
    // agent:one's 2nd consecutive message (same author, one turn) is NOT a new hop → still 1.
    expect(rows[1]!.annotations).toMatchObject({
      agentHops: 1,
    });
    // the payload itself is never mutated by the transport
    for (const row of rows) {
      const payload = row.payload as {
        causality?: { agentHops?: number };
      };
      expect(payload.causality?.agentHops).toBeUndefined();
    }

    // explicit caller-computed hops win
    await instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-a3", { agentHops: 9 }),
    );
    const explicit = canonicalLedger(instance)
      .read({ limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.payloadKind === "message.completed")
      .slice(-1);
    expect(explicit[0]!.annotations).toMatchObject({ agentHops: 9 });
  });

  it("rebuilds conversation policy state across a fork (the fork-wipe bug fix)", async () => {
    const parent = await createGadBackedChannel({
      channelKey: "channel-policy-parent",
    });
    await appendOpaqueChannelPage(parent);
    setRpcCaller(parent.instance, "agent:one", "server");
    await parent.instance.subscribe("agent:one", {
      contextId: "ctx-1",
      name: "Agent",
      type: "agent",
    });
    await parent.instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-p1"),
    );
    await parent.instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-p2"),
    );
    const parentState = await parent.instance.getPolicyState();
    expect(parentState.state).toMatchObject({
      agentStreak: 1,
      lastCompletedSender: "agent:one",
    });

    const fork = await createGadBackedChannel({
      channelKey: "channel-policy-fork",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
    });
    await initializeChannelClone(
      fork,
      "channel-policy-parent",
      "ctx-policy-fork",
    );
    await fork.instance.postClone(
      "channel-policy-parent",
      parentState.foldedThroughSeq,
      "ctx-policy-fork",
    );

    // conversation state SURVIVES the fork — rebuilt by replaying the lineage
    const forkState = await fork.instance.getPolicyState();
    expect(forkState.state).toMatchObject({
      agentStreak: 1,
      lastCompletedSender: "agent:one",
    });

    setRpcCaller(fork.instance, "agent:one", "server");
    await fork.instance.subscribe("agent:one", {
      contextId: "ctx-policy-fork",
      name: "Agent",
      type: "agent",
    });
    await fork.instance.publish(
      "agent:one",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agentCompleted("msg-f1"),
    );
    const stamped = (
      fork.instance as unknown as { channelLog: ChannelLog }
    ).channelLog.ledger
      .read({
        afterSeq: 0,
        limit: 1000,
        payloadKind: "message.completed",
      })
      .at(-1)!;
    // msg-f1 is agent:one again (same author across the fork) → still 1 hop, not 3.
    expect(stamped.annotations).toMatchObject({ agentHops: 1 });
  });

  it("returns the original accepted payload on idempotent retries and owner restart", async () => {
    const { instance, gad, db } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });

    const payload = agenticEvent();
    const first = await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      payload,
      {
        idempotencyKey: "durable-key-1",
      },
    );

    const retry = {
      ...payload,
      causality: { messageId: "unaccepted-retry-id" },
      createdAt: new Date(Date.now() + 1).toISOString(),
    };
    const restarted = await createGadBackedChannel({ gad, db });
    setRpcCaller(restarted.instance, "panel:user", "panel");
    for (const owner of [instance, restarted.instance]) {
      const second = await owner.publish(
        "panel:user",
        AGENTIC_EVENT_PAYLOAD_KIND,
        retry,
        {
          idempotencyKey: "durable-key-1",
        },
      );
      expect(second).toEqual(first);
      // The authenticated publisher seals actor identity before admission.
      expect(second.payload).toEqual({
        ...payload,
        actor: {
          kind: "panel",
          id: "panel:user",
          participantId: "panel:user",
          displayName: "User",
          metadata: { name: "User", type: "panel" },
        },
      });
    }
    expect(
      canonicalLedger(instance)
        .read({ limit: 1000 })
        .filter((event) => event.envelopeId === "ik:durable-key-1"),
    ).toHaveLength(1);
  });

  it("returns the accepted message identity when a caller retries through sendAsCaller", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    const payload = agenticEvent();
    const first = await instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      payload,
      {
        idempotencyKey: "caller-retry",
      },
    );
    await expect(
      instance.sendAsCaller("retry", { idempotencyKey: "caller-retry" }),
    ).resolves.toEqual({
      id: first.id,
      messageId: payload.causality.messageId,
    });
    setRpcCaller(instance, "panel:other", "panel");
    await expect(
      instance.sendAsCaller("other", { idempotencyKey: "caller-retry" }),
    ).rejects.toThrow(
      "Idempotency key belongs to another participant or payload type",
    );
  });

  it("rejects a retry key owned by another publisher or payload type", async () => {
    const { instance, gad, db } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await instance.publish(
      "panel:user",
      "private.original",
      { secret: "owner-only" },
      {
        idempotencyKey: "private-key",
      },
    );
    const restarted = await createGadBackedChannel({ gad, db });
    for (const owner of [instance, restarted.instance]) {
      setRpcCaller(owner, "panel:other", "panel");
      await owner.subscribe("panel:other", {
        contextId: "ctx-1",
        name: "Other",
        type: "panel",
      });
      await expect(
        owner.publish(
          "panel:other",
          "private.original",
          {},
          {
            idempotencyKey: "private-key",
          },
        ),
      ).rejects.toThrow(
        "Idempotency key belongs to another participant or payload type",
      );
      setRpcCaller(owner, "panel:user", "panel");
      await expect(
        owner.publish(
          "panel:user",
          "different.type",
          {},
          {
            idempotencyKey: "private-key",
          },
        ),
      ).rejects.toThrow(
        "Idempotency key belongs to another participant or payload type",
      );
    }
    expect(
      canonicalLedger(instance)
        .read({ limit: 1000 })
        .filter((event) => event.envelopeId === "ik:private-key"),
    ).toHaveLength(1);
  });

  it("treats duplicate pending callMethod as a durable redrive", async () => {
    const { instance, sql } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "call-redrive",
      "eval",
      { code: "first" },
      {
        invocationId: "inv-redrive",
        transportCallId: "call-redrive",
        turnId: "turn-redrive",
      },
    );
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "call-redrive",
      "mutated_eval",
      { code: "second" },
      {
        invocationId: "inv-redrive",
        transportCallId: "call-redrive",
        turnId: "turn-redrive",
      },
    );

    expect(
      canonicalLedger(instance)
        .read({ limit: 1000 })
        .filter((event) => event.envelopeId === "inv-redrive"),
    ).toHaveLength(1);

    const pending = sql
      .exec(
        `SELECT method FROM pending_calls WHERE transport_call_id = ?`,
        "call-redrive",
      )
      .toArray();
    expect(pending).toEqual([expect.objectContaining({ method: "eval" })]);
  });

  it("reconstructs pending_calls from the log after cache amnesia", async () => {
    const channel = await createGadBackedChannel();
    const { instance, sql } = channel;
    await appendOpaqueChannelPage(channel);
    setRpcCaller(instance, "panel:caller", "panel");
    await instance.subscribe("panel:caller", {
      contextId: "ctx-1",
      name: "Caller",
      type: "panel",
    });
    setRpcCaller(instance, "panel:provider", "panel");
    await instance.subscribe("panel:provider", {
      contextId: "ctx-1",
      name: "Provider",
      type: "panel",
    });

    setRpcCaller(instance, "panel:caller", "panel");
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "call-keep",
      "slow_method",
      { input: 1 },
      {
        invocationId: "inv-keep",
        transportCallId: "call-keep",
        turnId: "turn-1",
        timeoutMs: 60000,
      },
    );
    await instance.callMethod(
      "panel:caller",
      "panel:provider",
      "call-settle",
      "fast_method",
      { input: 2 },
      { invocationId: "inv-settle", transportCallId: "call-settle" },
    );

    setRpcCaller(instance, "panel:provider", "panel");
    await instance.submitMethodResult(
      "panel:provider",
      "call-settle",
      { ok: true },
      false,
    );

    // P3: derived state is deletable at any time
    sql.exec(`DELETE FROM pending_calls`);
    const { inserted } = await instance.reconcilePendingCalls(true);
    expect(inserted).toBe(1);

    const rows = sql.exec(`SELECT * FROM pending_calls`).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transport_call_id: "call-keep",
      invocation_id: "inv-keep",
      caller_id: "panel:caller",
      target_id: "panel:provider",
      method: "slow_method",
      turn_id: "turn-1",
    });
    // args come back in journal form — $.payload.request is blob-spilled by
    // the storage boundary, so the rebuilt row carries the blob ref
    expect(JSON.parse(rows[0]!["args"] as string)).toMatchObject({
      protocol: "vibestudio.blob-ref.v1",
    });
    expect(Number(rows[0]!["deadline_at"])).toBeGreaterThan(0);

    // the rebuilt row settles normally, with the deterministic terminal id
    await instance.submitMethodResult(
      "panel:provider",
      "call-keep",
      { ok: 1 },
      false,
    );
    const terminals = canonicalLedger(instance)
      .read({ limit: 1000 })
      .filter((event) => String(event.envelopeId).startsWith("terminal:"));
    expect(terminals.map((event) => event.envelopeId)).toEqual(
      expect.arrayContaining(["terminal:call-settle", "terminal:call-keep"]),
    );
    expect(
      sql.exec(`SELECT COUNT(*) AS cnt FROM pending_calls`).toArray()[0]?.[
        "cnt"
      ],
    ).toBe(0);
  });

  it("does not turn subscription recovery into a pending-call redelivery lifecycle", async () => {
    const emitted: unknown[] = [];
    let countRedeliveryTerminalProbes = false;
    let redeliveryTerminalProbeCount = 0;
    let redeliveryFullLogReadCount = 0;
    let redeliveryBatchProbeCount = 0;
    let sawRedeliveryBatchProbe = false;
    const { instance, sql } = await createGadBackedChannel({
      emitted,
      rpcCall: (_target, method, args) => {
        const firstArg = args[0] as { envelopeId?: unknown } | undefined;
        if (
          countRedeliveryTerminalProbes &&
          method === "getLogEvent" &&
          firstArg?.envelopeId === "terminal:call-feedback"
        ) {
          redeliveryTerminalProbeCount += 1;
        }
        if (
          countRedeliveryTerminalProbes &&
          sawRedeliveryBatchProbe &&
          method === "readLog"
        ) {
          redeliveryFullLogReadCount += 1;
        }
        if (countRedeliveryTerminalProbes && method === "hasLogEvents") {
          redeliveryBatchProbeCount += 1;
          sawRedeliveryBatchProbe = true;
        }
        return undefined;
      },
    });

    setRpcCaller(instance, "agent:caller", "worker");
    await instance.subscribe("agent:caller", {
      contextId: "ctx-1",
      name: "Agent",
      type: "agent",
    });
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });

    setRpcCaller(instance, "agent:caller", "worker");
    await instance.callMethod(
      "agent:caller",
      "panel:user",
      "call-feedback",
      "feedback_form",
      { title: "Continue?" },
      {
        invocationId: "inv-feedback",
        transportCallId: "call-feedback",
        turnId: "turn-feedback",
      },
    );

    setRpcCaller(instance, "panel:user", "panel");
    await instance.submitMethodResult(
      "panel:user",
      "call-feedback",
      { type: "submit", value: { ok: true } },
      false,
      { invocationId: "inv-feedback", turnId: "turn-feedback" },
    );

    // Simulate a crash/old-cache state: the durable terminal exists, but the
    // declared pending_calls cache still contains the answered feedback call.
    sql.exec(
      `INSERT INTO pending_calls (transport_call_id, invocation_id, turn_id, caller_id,
        target_id, method, args, created_at, deadline_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "call-feedback",
      "inv-feedback",
      "turn-feedback",
      "agent:caller",
      "panel:user",
      "feedback_form",
      JSON.stringify({ title: "Continue?" }),
      Date.now() - 60_000,
      null,
    );
    emitted.length = 0;
    countRedeliveryTerminalProbes = true;

    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    countRedeliveryTerminalProbes = false;
    await Promise.resolve();

    const redeliveredFeedback = emitted.filter((payload) => {
      const signal = payload as {
        message?: {
          kind?: string;
          payload?: {
            kind?: string;
            causality?: { transportCallId?: string };
            payload?: { name?: string };
          };
        };
      };
      return (
        signal.message?.kind === "signal" &&
        signal.message.payload?.kind === "invocation.started" &&
        signal.message.payload.causality?.transportCallId === "call-feedback" &&
        signal.message.payload.payload?.name === "feedback_form"
      );
    });

    expect(redeliveredFeedback).toHaveLength(0);
    expect(redeliveryTerminalProbeCount).toBe(0);
    expect(redeliveryFullLogReadCount).toBe(0);
    expect(redeliveryBatchProbeCount).toBe(0);
    // Cache repair remains an explicit fold of the durable log; subscribing has
    // no hidden cleanup or synthetic invocation delivery side effect.
    await instance.reconcilePendingCalls(true);
    expect(
      sql
        .exec(
          `SELECT transport_call_id FROM pending_calls WHERE transport_call_id = ?`,
          "call-feedback",
        )
        .toArray(),
    ).toHaveLength(0);
  });
});

describe("PubSubChannel fork lineage delivery", () => {
  it("owns live lineage subscriptions through their response stream", async () => {
    const { instance } = await createGadBackedChannel({
      channelKey: "lineage-root",
    });
    setRpcCaller(instance, "panel:viewer", "panel");
    const response = await instance.subscribeLineage("panel:viewer");
    const reader = response.body!.getReader();
    const ack = await reader.read();
    expect(
      JSON.parse(new TextDecoder().decode(ack.value).trim()),
    ).toMatchObject({
      kind: "subscribed",
      result: { ok: true, rootChannelId: "lineage-root" },
    });

    const internal = instance as unknown as {
      recordLineageHead(channelId: string, headSeq: number): void;
      lineageSubscriptionStreams: Map<string, unknown>;
    };
    internal.recordLineageHead("lineage-child", 14);
    const message = await reader.read();
    expect(
      JSON.parse(new TextDecoder().decode(message.value).trim()),
    ).toMatchObject({
      kind: "message",
      payload: {
        kind: "signal",
        payload: {
          contentType: "fork.head_changed",
          content: JSON.stringify({ channelId: "lineage-child", headSeq: 14 }),
        },
      },
    });
    await reader.cancel();
    expect(internal.lineageSubscriptionStreams.size).toBe(0);
  });

  it("coalesces descendant heads and reports directly to the lineage root", async () => {
    const reports: Array<{ target: string; report: unknown }> = [];
    const parent = await createGadBackedChannel({ channelKey: "lineage-mid" });
    setRpcCaller(parent.instance, "panel:owner", "panel");
    await parent.instance.subscribe("panel:owner", {
      contextId: "lineage-parent-context",
      name: "Owner",
      type: "panel",
    });
    const child = await createGadBackedChannel({
      channelKey: "lineage-leaf",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workers.resolveService" &&
          args[0] === "vibestudio.channel.v1"
        ) {
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
            {
              source: "workers/pubsub-channel",
              name: "PubSubChannel",
              className: "PubSubChannel",
              objectKey: String(args[1]),
            },
          );
        }
        if (method === "reportLineageHead") {
          reports.push({ target, report: args[0] });
          return null;
        }
        return undefined;
      },
    });
    await initializeChannelClone(child, "lineage-mid", "lineage-context");
    await child.instance.postClone("lineage-mid", 1, "lineage-context", {
      forkId: "lineage-fork-1",
      rootChannelId: "lineage-root",
    });
    const internal = child.instance as unknown as {
      noteLineageHeadAdvance(headSeq: number, rosterChanged?: boolean): void;
      flushLineageHeadOutbox(): Promise<void>;
    };
    internal.noteLineageHeadAdvance(11);
    internal.noteLineageHeadAdvance(15, true);
    await internal.flushLineageHeadOutbox();

    expect(reports).toEqual([
      {
        target: "do:workers/pubsub-channel:PubSubChannel:lineage-root",
        report: { channelId: "lineage-leaf", headSeq: 15, rosterChanged: true },
      },
    ]);
  });
});

// appendSeed is fork plumbing: it consumes the child channel's pending fork seed
// marker, appends the opening message once, and is idempotent on crash re-drive.
describe("PubSubChannel appendSeed fork plumbing", () => {
  const SEED_AUTHOR = {
    kind: "user" as const,
    id: "panel:user",
    participantId: "panel:user",
  };
  function forkSeed(author = SEED_AUTHOR) {
    return {
      author,
      blocks: [
        {
          blockId: "fork-seed:fork-1:block:0" as BlockId,
          type: "text" as const,
          content: "explore this branch",
        },
      ],
    };
  }

  // A cloned CHILD channel whose parent fork op (channel-parent) planted a
  // pending seed marker at postClone. `withSeed:false` clones WITHOUT planting
  // the marker (mirrors a fork with no seed).
  async function forkedChild(opts: { withSeed?: boolean } = {}): Promise<{
    parent: Awaited<ReturnType<typeof createGadBackedChannel>>;
    child: Awaited<ReturnType<typeof createGadBackedChannel>>;
  }> {
    const withSeed = opts.withSeed ?? true;
    const parent = await createGadBackedChannel({
      channelKey: "channel-parent",
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    // seq 1 = presence, seq 2 = message → fork point is 2.
    await parent.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      name: "User",
      type: "panel",
    });
    await parent.instance.publish(
      "panel:user",
      AGENTIC_EVENT_PAYLOAD_KIND,
      agenticEvent(),
    );
    const child = await createGadBackedChannel({
      channelKey: "channel-child",
      gad: parent.gad,
      db: clonedChannelDatabase(parent),
      rpcCall: (target, method, args) => {
        if (
          target === "main" &&
          method === "workers.resolveService" &&
          args[0] === "vibestudio.channel.v1"
        ) {
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
            {
              source: "workers/pubsub-channel",
              name: "PubSubChannel",
              className: "PubSubChannel",
              objectKey: String(args[1]),
            },
          );
        }
        return undefined;
      },
    });
    await initializeChannelClone(child, "channel-parent", "ctx-forked");
    await child.instance.postClone("channel-parent", 2, "ctx-forked", {
      forkId: "fork-1",
      rootChannelId: "channel-parent",
      ...(withSeed ? { seed: forkSeed() } : {}),
    });
    return { parent, child };
  }

  // Envelopes appended past the fork point (2). The seed is the only event
  // appendSeed writes.
  async function tailAfterFork(
    child: Awaited<ReturnType<typeof createGadBackedChannel>>,
  ) {
    const replay = await child.instance.getReplayAfter({ after: 2 });
    return replay.logEvents;
  }

  it("appends the fork seed once and is idempotent on re-drive", async () => {
    const { child } = await forkedChild();
    setRpcCaller(
      child.instance,
      "do:workers/pubsub-channel:PubSubChannel:channel-parent",
      "do",
    );

    const res = await child.instance.appendSeed({ forkId: "fork-1" });
    expect(res.messageId).toBe("fork-seed:fork-1");

    const tail = await tailAfterFork(child);
    const seeds = tail.filter((e) => e.type === AGENTIC_EVENT_PAYLOAD_KIND);
    expect(seeds).toHaveLength(1);
    const seed = seeds[0]!.payload as {
      kind: string;
      actor: { participantId?: string; id: string };
      payload: { role: string; tier: string };
    };
    // A primary user message, authored from the supplied seed envelope.
    expect(seed.kind).toBe("message.completed");
    expect(seed.payload.role).toBe("user");
    expect(seed.payload.tier).toBe("primary");
    expect(seed.actor.participantId ?? seed.actor.id).toBe("panel:user");

    // Re-drive (crash-resume) returns the SAME durable message; no duplicate.
    const again = await child.instance.appendSeed({ forkId: "fork-1" });
    expect(again).toEqual(res);
    expect(
      (await tailAfterFork(child)).filter(
        (e) => e.type === AGENTIC_EVENT_PAYLOAD_KIND,
      ),
    ).toHaveLength(1);
  });

  it("rejects a call with no pending fork seed marker", async () => {
    const { child } = await forkedChild({ withSeed: false });
    setRpcCaller(
      child.instance,
      "do:workers/pubsub-channel:PubSubChannel:channel-parent",
      "do",
    );

    await expect(
      child.instance.appendSeed({ forkId: "fork-1" }),
    ).rejects.toThrow(/no pending fork seed for fork fork-1/);
    expect(await tailAfterFork(child)).toHaveLength(0);
  });

  it("rejects a forkId that does not match the pending seed marker", async () => {
    const { child } = await forkedChild();
    setRpcCaller(
      child.instance,
      "do:workers/pubsub-channel:PubSubChannel:channel-parent",
      "do",
    );

    await expect(
      child.instance.appendSeed({ forkId: "fork-EVIL" }),
    ).rejects.toThrow(/no pending fork seed for fork fork-EVIL/);
    expect(await tailAfterFork(child)).toHaveLength(0);
  });

  it("rejects a different channel even when it knows the pending fork id", async () => {
    const { child } = await forkedChild();
    setRpcCaller(
      child.instance,
      "do:workers/pubsub-channel:PubSubChannel:channel-attacker",
      "do",
    );
    await expect(
      child.instance.appendSeed({ forkId: "fork-1" }),
    ).rejects.toThrow(/recorded parent channel/);
    expect(await tailAfterFork(child)).toHaveLength(0);
  });

  it("keeps relay attestation separate from appendSeed's exact-parent check", async () => {
    const { instance } = await createGadBackedChannel();
    const gate = instance as unknown as {
      inboundCallerDenial(
        method: string,
        args: readonly unknown[],
        caller: {
          callerId: string;
          callerKind: string;
          authorization?: ReturnType<typeof createTestDirectAuthority>;
        } | null,
        authorityAcceptedAt: number,
      ): string | null;
    };
    const denialFor = (kind: "panel" | "worker" | "server" | "do" | "shell") =>
      gate.inboundCallerDenial(
        "appendSeed",
        [],
        {
          callerId: `${kind}:x`,
          callerKind: kind,
          authorization: createTestDirectAuthority({
            callerKind: kind,
            method: "appendSeed",
            effect: { kind: "open" },
            capability: "workspace-service:channel",
            targetCapability: "workspace-service:channel",
            targetPrincipals: ["host", "user", "code"],
            objectKey: "channel-1",
          }),
        },
        Date.now(),
      );
    for (const kind of ["do", "worker", "panel", "shell", "server"] as const) {
      expect(denialFor(kind)).toBeNull();
    }
  });
});

describe("conversation creation seed", () => {
  it("uses the same creation seed for locked channels without exposing membership initialization to ordinary callers", async () => {
    const { instance } = await createGadBackedChannel();
    const config = {
      membershipPolicy: {
        kind: "locked" as const,
        participants: ["panel:user"],
      },
      seed: { messages: [{ author: "Introduction", content: "Welcome" }] },
    };
    await expect(
      instance.initializeConversation("ctx-locked", config),
    ).rejects.toThrow("initializeLockedChannel");
    await instance.initializeLockedChannel("ctx-locked", config);
    await instance.initializeLockedChannel("ctx-locked", config);
    expect(
      canonicalAgenticEvents(instance).filter(
        (event) => event.kind === "message.completed",
      ),
    ).toHaveLength(1);
    expect((await instance.getConfig())?.seed).toBeUndefined();
    await expect(
      instance.initializeLockedChannel("ctx-locked", {
        ...config,
        seed: { openingRequest: "Changed" },
      }),
    ).rejects.toThrow("does not match");
  });

  const seed = {
    messages: [
      {
        author: "Product introduction",
        content: '<Video url="https://youtu.be/Pb6C4ORBOOI" title="Welcome" />',
      },
    ],
    openingRequest: "Help me get started",
  };
  it("shows authored media before an agent exists and preserves one seed across reconnect and eviction", async () => {
    const channel = await createGadBackedChannel();
    setRpcCaller(channel.instance, "panel:user", "panel");
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
      channelConfig: { seed },
    });
    expect(
      canonicalAgenticEvents(channel.instance).filter(
        (event) => event.kind === "message.completed",
      ),
    ).toHaveLength(1);
    expect(await channel.instance.getConfig()).toMatchObject({
      initialization: {
        firstAgentPending: true,
        openingRequest: seed.openingRequest,
      },
    });
    expect(
      await channel.instance.updateConfig({ title: "Introduction" }),
    ).toMatchObject({
      title: "Introduction",
      initialization: {
        firstAgentPending: true,
        openingRequest: seed.openingRequest,
      },
    });
    await channel.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
      channelConfig: {
        seed: {
          messages: [{ author: "Changed", content: "Do not install again" }],
        },
      },
    });
    const remount = await createGadBackedChannel({
      db: channel.db,
      gad: channel.gad,
    });
    setRpcCaller(remount.instance, "panel:user", "panel");
    await remount.instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
    });
    const messages = canonicalAgenticEvents(channel.instance).filter(
      (event) => event.kind === "message.completed",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.actor).toMatchObject({
      kind: "system",
      displayName: "Product introduction",
    });
    await expect(
      remount.instance.resolveOpeningRequest("panel:user", "deliver"),
    ).rejects.toThrow("subscribed agent");
  });
  it("delivers the opening request once after an agent subscribes, including concurrent retries", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
      channelConfig: { seed },
    });
    const agentId = "do:workers/agent-worker:AiChatWorker:seed-agent";
    await joinEntity(instance, agentId, {
      type: "agent",
      handle: "seed-agent",
    });
    setRpcCaller(instance, "panel:user", "panel");
    await Promise.all([
      instance.resolveOpeningRequest("panel:user", "deliver"),
      instance.resolveOpeningRequest("panel:user", "deliver"),
    ]);
    await instance.resolveOpeningRequest("panel:user", "deliver");
    const messages = canonicalAgenticEvents(instance).filter(
      (event) => event.kind === "message.completed",
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]!.actor).toMatchObject({ id: "panel:user" });
    expect(messages[1]!.payload).toMatchObject({
      role: "user",
      blocks: [{ type: "text", content: seed.openingRequest }],
    });
    expect(await instance.getConfig()).toMatchObject({
      initialization: { firstAgentPending: false },
    });
    expect(
      (await instance.getConfig())?.initialization?.openingRequest,
    ).toBeUndefined();
  });
  it.each(["deliver", "cancel"] as const)(
    "keeps a failed %s resolution retryable through its durable config notification",
    async (outcome) => {
      let failConfig = false;
      const channel = await createGadBackedChannel();
      const log = (channel.instance as unknown as { channelLog: ChannelLog })
        .channelLog;
      const append = log.append.bind(log);
      vi.spyOn(log, "append").mockImplementation(async (input) => {
        if (failConfig && input.type === "config-update") {
          failConfig = false;
          throw new Error("Config publication failed");
        }
        return append(input);
      });
      setRpcCaller(channel.instance, "panel:user", "panel");
      await channel.instance.subscribe("panel:user", {
        contextId: "ctx-1",
        type: "panel",
        channelConfig: { seed },
      });
      const agentId = "do:workers/agent-worker:AiChatWorker:resolution";
      await joinEntity(channel.instance, agentId, {
        type: "agent",
        handle: "resolution",
      });
      setRpcCaller(channel.instance, "panel:user", "panel");
      failConfig = true;
      await expect(
        channel.instance.resolveOpeningRequest("panel:user", outcome),
      ).rejects.toThrow("Config publication failed");
      expect(
        (await channel.instance.getConfig())?.initialization?.openingRequest,
      ).toBe(seed.openingRequest);
      // Finishing an accepted publication must not require its original receiver
      // to still be present. The opposite requested outcome cannot rewrite it.
      setRpcCaller(channel.instance, agentId, "do");
      await channel.instance.leave({ participantId: agentId, revision: 1 });
      const restored = await createGadBackedChannel({
        db: channel.db,
        gad: channel.gad,
      });
      setRpcCaller(restored.instance, "panel:user", "panel");
      await restored.instance.resolveOpeningRequest(
        "panel:user",
        outcome === "deliver" ? "cancel" : "deliver",
      );
      expect(
        (await restored.instance.getConfig())?.initialization?.openingRequest,
      ).toBeUndefined();
      expect(
        canonicalLedger(restored.instance)
          .read({ limit: 1000 })
          .filter((event) => event.payloadKind === "config-update"),
      ).toHaveLength(1);
      expect(
        canonicalAgenticEvents(channel.instance).filter(
          (event) => event.kind === "message.completed",
        ),
      ).toHaveLength(outcome === "deliver" ? 2 : 1);
    },
  );

  it.each(["opening", "resolution"])(
    "recovers a lost %s append reply without redelivery or a new author",
    async (phase) => {
      const gad = await createTestDO(GadWorkspaceDO, {
        __objectKey: "workspace",
        RPC_FETCH: channelTestRpcFetch,
      });
      let loseReply = false;
      const channel = await createGadBackedChannel({ gad });
      const log = (channel.instance as unknown as { channelLog: ChannelLog })
        .channelLog;
      const append = log.append.bind(log);
      vi.spyOn(log, "append").mockImplementation(async (input) => {
        const event = await append(input);
        if (loseReply && input.messageId === `conversation-seed:${phase}`) {
          loseReply = false;
          throw new Error("Accepted append reply lost");
        }
        return event;
      });
      setRpcCaller(channel.instance, "panel:user", "panel");
      await channel.instance.subscribe("panel:user", {
        contextId: "ctx-1",
        type: "panel",
        channelConfig: { seed },
      });
      const agentId = "do:workers/agent-worker:AiChatWorker:lost-reply";
      await joinEntity(channel.instance, agentId, {
        type: "agent",
        handle: "lost-reply",
      });
      setRpcCaller(channel.instance, "panel:user", "panel");
      loseReply = true;
      await expect(
        channel.instance.resolveOpeningRequest("panel:user", "deliver"),
      ).rejects.toThrow("Accepted append reply lost");
      const reopened = await createGadBackedChannel({ db: channel.db, gad });
      expect(
        (await reopened.instance.getConfig())?.initialization?.openingRequest,
      ).toBe(phase === "resolution" ? undefined : seed.openingRequest);
      setRpcCaller(channel.instance, agentId, "do");
      await channel.instance.leave({ participantId: agentId, revision: 1 });
      const restored = await createGadBackedChannel({ db: channel.db, gad });
      setRpcCaller(restored.instance, "panel:another", "panel");
      await restored.instance.subscribe("panel:another", {
        contextId: "ctx-1",
        type: "panel",
      });
      await restored.instance.resolveOpeningRequest("panel:another", "cancel");
      expect(
        (await restored.instance.getConfig())?.initialization?.openingRequest,
      ).toBeUndefined();
      const messages = canonicalAgenticEvents(restored.instance).filter(
        (event) => event.kind === "message.completed",
      );
      expect(messages).toHaveLength(2);
      expect(messages[1]!.actor.id).toBe("panel:user");
      expect(
        canonicalLedger(restored.instance)
          .read({ limit: 1000 })
          .filter((event) => event.payloadKind === "config-update"),
      ).toHaveLength(1);
    },
  );

  it("keeps the first-agent lifecycle after role changes and projection reconstruction", async () => {
    const channel = await createGadBackedChannel();
    const id = "do:workers/agent-worker:AiChatWorker:lifecycle";
    await joinEntity(channel.instance, id);
    await channel.instance.join({
      participantId: id,
      operationId: "join-2",
      contextId: "ctx-1",
      metadata: { type: "headless" },
      delivery: "all",
      endpoint: { kind: "entity", entityId: id, invocation: "direct" },
      applicationConfig: null,
      replay: false,
    });
    expect(
      (await channel.instance.getConfig())?.initialization?.firstAgentPending,
    ).toBe(false);
    channel.sql.exec(
      "UPDATE channel_delivery_projection_cursor SET projection_version = 0",
    );
    const restored = await createGadBackedChannel({
      db: channel.db,
      gad: channel.gad,
    });
    expect(
      (await restored.instance.getConfig())?.initialization?.firstAgentPending,
    ).toBe(false);
  });
  it("persists explicit cancellation and rejects mutable seed configuration", async () => {
    const { instance } = await createGadBackedChannel();
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-1",
      type: "panel",
      channelConfig: { seed },
    });
    await instance.resolveOpeningRequest("panel:user", "cancel");
    await instance.resolveOpeningRequest("panel:user", "deliver");
    expect(
      canonicalAgenticEvents(instance).filter(
        (event) => event.kind === "message.completed",
      ),
    ).toHaveLength(1);
    expect(
      (await instance.getConfig())?.initialization?.openingRequest,
    ).toBeUndefined();
    await expect(instance.updateConfig({ seed })).rejects.toThrow(
      "creation-owned",
    );
  });
});

describe("conversation image ownership", () => {
  it("retains generated originals before accepting their reference and rejects missing assets", async () => {
    const retained: unknown[] = [];
    const { instance } = await createGadBackedChannel({
      rpcCall: async (target, method, args) => {
        if (
          target === "main" &&
          method === "workers.resolveService" &&
          args[0] === "vibestudio.images.v1"
        )
          return durableObjectServiceFixture(
            "do:workers/images:ImagesDO:workspace",
          );
        if (target === "do:workers/images:ImagesDO:workspace") {
          if (method === "getAsset") {
            if (args[0] !== "image-one") throw new Error("Unknown image asset");
            return { id: "image-one" };
          }
          if (method === "retain") {
            retained.push(args[0]);
            return null;
          }
        }
        return undefined;
      },
    });
    setRpcCaller(instance, "panel:user", "panel");
    await instance.subscribe("panel:user", {
      contextId: "ctx-images",
      type: "panel",
    });
    const base = agenticEvent();
    const event = {
      ...base,
      payload: {
        ...base.payload,
        metadata: { imageAssetIds: ["image-one", "image-one"] },
      },
    };
    await instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, event);
    expect(retained).toEqual([
      { assetId: "image-one", owner: "conversation:ctx-images:channel-1" },
    ]);
    const accepted = canonicalAgenticEvents(instance).filter(
      (item) => item.kind === "message.completed",
    );
    expect(accepted).toHaveLength(1);
    event.payload.metadata = { imageAssetIds: ["missing"] };
    await expect(
      instance.publish("panel:user", AGENTIC_EVENT_PAYLOAD_KIND, event),
    ).rejects.toThrow("Unknown image asset");
    expect(
      canonicalAgenticEvents(instance).filter(
        (item) => item.kind === "message.completed",
      ),
    ).toHaveLength(1);
  });
});

describe("channel fork lifetime ownership", () => {
  it("initializes copied operational state before any child maintenance admission", async () => {
    const child = await createGadBackedChannel({
      channelKey: "initialized-child",
    });
    child.sql
      .exec(`INSERT INTO state (key, value) VALUES ('contextId', 'source-context'),
      ('forkSeedMarker', '{}'), ('openingRequestResolution', 'deliver'),
      ('conversationSeed', '{"openingRequest":{"blocks":[]}}')`);
    child.sql
      .exec(`INSERT INTO fork_ops (fork_id, fork_point_id, opts, phase, created_at, updated_at)
      VALUES ('source-operation', 0, '{}', 'journaled', 1, 1)`);
    await initializeChannelClone(child, "source-channel", "child-context");
    expect(child.sql.exec(`SELECT * FROM fork_ops`).toArray()).toEqual([]);
    expect(
      child.sql.exec(`SELECT * FROM channel_maintenance_queue`).toArray(),
    ).toEqual([]);
    expect(
      child.sql
        .exec(`SELECT value FROM state WHERE key = 'forkSeedMarker'`)
        .toArray(),
    ).toEqual([]);
    expect(await child.instance.getContextId()).toBe("child-context");
    expect(
      child.sql
        .exec(`SELECT value FROM state WHERE key = 'openingRequestOutcome'`)
        .toArray(),
    ).toEqual([{ value: "cancel" }]);
  });

  it("never starts a second fork driver because its live owner is slow", async () => {
    let entered!: () => void;
    let release!: () => void;
    const admitted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clone = vi.fn(async () => {
      entered();
      await held;
      return {
        contextId: "owned-context",
        contexts: [],
        rewired: [],
        entities: [
          {
            sourceId: "do:workers/pubsub-channel:PubSubChannel:owner-channel",
            newId: "do:workers/pubsub-channel:PubSubChannel:owned-child",
            kind: "do",
            source: "workers/pubsub-channel",
            className: "PubSubChannel",
            sourceKey: "owner-channel",
            newKey: "owned-child",
            targetId: "do:workers/pubsub-channel:PubSubChannel:owned-child",
          },
        ],
      };
    });
    const parent = await createGadBackedChannel({
      channelKey: "owner-channel",
      rpcCall: (_target, method, args) => {
        if (
          method === "workers.resolveService" &&
          args[0] === "vibestudio.channel.v1"
        )
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
            {
              source: "workers/pubsub-channel",
              name: "PubSubChannel",
              className: "PubSubChannel",
              objectKey: String(args[1]),
            },
          );
        if (method === "runtime.cloneContext") return clone();
        if (method === "postClone") return null;
        return undefined;
      },
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    await parent.instance.subscribe("panel:user", {
      contextId: "source-context",
      name: "User",
      type: "panel",
    });
    const input = {
      operationId: "slow-owned-fork",
      locus: { kind: "head" as const },
      reason: "history",
    };
    const first = parent.instance.fork(input);
    await admitted;
    const second = parent.instance.fork(input);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    const internal = parent.instance as unknown as {
      materializeDueMaintenance(now: number): void;
      runForkOp(id: string): ReturnType<PubSubChannel["fork"]>;
    };
    const recovery = internal.runForkOp(input.operationId);
    try {
      internal.materializeDueMaintenance(Date.now());
      expect(
        parent.sql
          .exec(
            `SELECT * FROM channel_maintenance_queue WHERE kind = 'fork-reconcile'`,
          )
          .toArray(),
      ).toEqual([]);
      expect(clone).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
      release();
    }
    expect(await second).toEqual(await first);
    expect(await recovery).toEqual(await first);
    expect(clone).toHaveBeenCalledOnce();
  });

  it("retirement cancels and joins the driver and its rollback before superclass release", async () => {
    let entered!: () => void;
    let release!: () => void;
    let cleaning!: () => void;
    let releaseCleanup!: () => void;
    const admitted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanupEntered = new Promise<void>((resolve) => {
      cleaning = resolve;
    });
    const cleanupHeld = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const destroy = vi.fn(async () => {
      cleaning();
      await cleanupHeld;
      return null;
    });
    const postClone = vi.fn(() => null);
    const parent = await createGadBackedChannel({
      channelKey: "retiring-channel",
      rpcCall: (_target, method, args) => {
        if (
          method === "workers.resolveService" &&
          args[0] === "vibestudio.channel.v1"
        )
          return durableObjectServiceFixture(
            `do:workers/pubsub-channel:PubSubChannel:${String(args[1])}`,
            {
              source: "workers/pubsub-channel",
              name: "PubSubChannel",
              className: "PubSubChannel",
              objectKey: String(args[1]),
            },
          );
        if (method === "runtime.cloneContext")
          return (async () => {
            entered();
            await held;
            return {
              contextId: "owned-context",
              contexts: [],
              rewired: [],
              entities: [
                {
                  sourceId:
                    "do:workers/pubsub-channel:PubSubChannel:retiring-channel",
                  newId: "do:workers/pubsub-channel:PubSubChannel:owned-child",
                  kind: "do",
                  source: "workers/pubsub-channel",
                  className: "PubSubChannel",
                  sourceKey: "retiring-channel",
                  newKey: "owned-child",
                  targetId:
                    "do:workers/pubsub-channel:PubSubChannel:owned-child",
                },
              ],
            };
          })();
        if (method === "runtime.destroyContext") return destroy();
        if (method === "postClone") return postClone();
        return undefined;
      },
    });
    setRpcCaller(parent.instance, "panel:user", "panel");
    await parent.instance.subscribe("panel:user", {
      contextId: "source-context",
      name: "User",
      type: "panel",
    });
    const fork = parent.instance.fork({
      operationId: "retired-owned-fork",
      locus: { kind: "head" },
      reason: "history",
    });
    const outcome = fork.catch((error: unknown) => error);
    await admitted;
    const baseRelease = vi.spyOn(
      Object.getPrototypeOf(PubSubChannel.prototype),
      "releaseForLifecycle",
    );
    await parent.instance.releaseForLifecycle({
      epoch: "retire-owned",
      phase: "quiesce",
      mode: "retire",
      reason: "entity_retire",
      deadlineMs: 0,
    });
    const retirement = parent.instance.releaseForLifecycle({
      epoch: "retire-owned",
      phase: "release",
      mode: "retire",
      reason: "entity_retire",
      deadlineMs: 0,
    });
    try {
      expect(baseRelease).not.toHaveBeenCalled();
      release();
      await cleanupEntered;
      expect(baseRelease).not.toHaveBeenCalled();
      expect(postClone).not.toHaveBeenCalled();
      releaseCleanup();
      await expect(outcome).resolves.toMatchObject({ code: "ECANCELLED" });
      await expect(retirement).resolves.toEqual({ status: "ready" });
      expect(baseRelease).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      release();
      releaseCleanup();
      baseRelease.mockRestore();
    }
  });
});
