import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  AgentDoc,
  createRegistry,
  defineDoc,
  InboxDoc,
  LiveDoc,
  MemoryStorage,
  StorageRejected,
  type Harness,
  type HarnessOptions,
  type ConversationId,
  type EntryId,
  type SubmissionId,
  type Storage,
  type StorageWrite,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import type { TurnId, UiFeedbackPayload } from "@workspace/agentic-protocol";
import { nativeTurnId } from "./native-turn-id.js";
import {
  openBoundAgentSession,
  retireBoundAgentSession,
} from "./native-agent-session.js";
import {
  openNativeChannelConversation,
  bindNativeChannelConversation,
  retainedNativeChannelSourceMessageAt,
  retainedNativeChannelOriginatingInput,
  waitForNativeChannelSourceMessageAt,
  lookupNativeChannelConversation,
  retainedNativeConversationChannel,
  verifyNativeChannelDeliveryReplay,
  NATIVE_CHANNEL_INPUT_ADMITTED_KIND,
  retainedNativeChannelDelivery,
  retainedNativeChannelSourceMessage,
  prepareNativeChannelReadReceipts,
  submitNativeChannelDelivery,
  type NativeChannelDelivery,
  type NativeChannelIntake,
} from "./native-channel-session.js";

const context = BACKGROUND_CONTEXT;
const binding = { channelId: "channel:one", contextId: "context:one" };
const owner = {
  runtimeId: "do:workers/agent:Agent:one",
  contextId: binding.contextId,
  incarnation: "host-storage-one",
  authoritySessionId: "host-authority-one",
};
const sessions: Harness[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  const results = await Promise.allSettled(
    sessions.splice(0).map((session) => session.close(context)),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
});

class RejectingStorage extends MemoryStorage {
  requestId: string | undefined;
  rejectConversation = false;
  readonly original = new StorageRejected("Native channel admission refused");
  override async commit(
    writes: readonly StorageWrite[],
    ctx: Parameters<Storage["commit"]>[1],
  ) {
    if (
      this.rejectConversation &&
      writes.some((write) => write.type === "conversation")
    ) {
      this.rejectConversation = false;
      throw this.original;
    }
    if (
      this.requestId &&
      writes.some(
        (write) =>
          write.type === "submission" &&
          write.value.requestId === this.requestId,
      )
    ) {
      this.requestId = undefined;
      throw this.original;
    }
    return super.commit(writes, ctx);
  }
}

async function fixture<S extends Storage = RejectingStorage>(
  storage: S = new RejectingStorage() as Storage as S,
  extra: Partial<HarnessOptions> = {},
) {
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  const harness = await openBoundAgentSession(
    storage,
    owner,
    {
      ...extra,
      models,
      registry: createRegistry(),
      publishWake: async () => {},
      modelRequests:
        extra.modelRequests ??
        (async (request) => ({
          status: "waiting",
          condition: {
            kind: "input",
            conversationId: request.conversationId,
            after: request.cutoff,
            kinds: ["test.model-ready"],
          },
        })),
    },
    context,
  );
  sessions.push(harness);
  const agent = {
    model: { provider: "faux", modelId: faux.getModel().id },
    instructions: "Channel-specific instructions",
  };
  const conversation = await openNativeChannelConversation(
    harness,
    binding,
    agent,
    context,
  );
  return { harness, storage, conversation, agent, faux };
}

function messageDelivery(
  id: string,
  kind = "message.completed",
  sequence = 10,
  author = "user:one",
): NativeChannelDelivery {
  const incoming = delivery(id);
  return {
    ...incoming,
    eventSequence: sequence,
    envelope: {
      kind: "log",
      event: {
        id: sequence,
        messageId: `source-event:${id}`,
        senderId: author,
        type: "agentic.trajectory.v1/event",
        payload: {
          kind,
          actor: { kind: "user", id: author },
          causality: { messageId: "message:one" },
          payload:
            kind === "message.completed"
              ? {
                  protocol: "agentic.trajectory.v1",
                  role: "user",
                  blocks: [
                    { type: "text", blockId: "block:one", content: "original" },
                  ],
                  outcome: "completed",
                }
              : kind === "message.edited"
                ? {
                    protocol: "agentic.trajectory.v1",
                    by: { kind: "user", id: author },
                    blocks: [
                      {
                        type: "text",
                        blockId: "block:one",
                        content: "corrected",
                      },
                    ],
                  }
                : {
                    protocol: "agentic.trajectory.v1",
                    by: { kind: "user", id: author },
                  },
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      },
    },
  };
}

function delivery(
  id: string,
  channelId = binding.channelId,
): NativeChannelDelivery {
  return {
    deliveryId: id,
    channelId,
    channelRef: {
      source: "workers/channel",
      className: "ChannelDO",
      objectKey: channelId,
    },
    participantId: "participant:agent",
    subscriptionRevision: 3,
    eventSequence: 4,
    envelope: {
      kind: "log",
      event: {
        messageId: `event:${id}`,
        senderId: "participant:user",
        type: "agentic",
        payload: {
          kind: "message.completed",
          payload: { blocks: [{ content: "hello" }] },
        },
      },
    },
    agenticContext: {
      version: 1,
      relationships: [],
      channelConfig: {},
      conversation: {
        lastCompletedSender: "participant:user",
        lastCompletedMessageId: `message:${id}`,
        lastCompletedSeq: 4,
        previousCompletedSender: null,
        previousCompletedMessageId: null,
        previousCompletedSeq: null,
        agentStreak: 0,
      },
      replyToSenderId: null,
    },
  };
}

function feedback(occurrenceKey: string): NativeChannelIntake {
  const payload: UiFeedbackPayload = {
    protocol: "agentic.trajectory.v1",
    target: { kind: "agent", id: "participant:agent" },
    category: "render_failed",
    occurrenceKey,
    error: { message: `Failure ${occurrenceKey}` },
  };
  return { kind: "feedback", payload };
}

const ProductInputFacts = defineDoc<{
  inputs: {
    submissionId: number;
    deliveryId: string;
    messageId: string | null;
  }[];
}>({
  kind: "test.product-input-facts",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ inputs: [] }),
  checkpointWhen: () => true,
});

describe("exact canonical native source admission observation", () => {
  const address = (incoming: NativeChannelDelivery) => ({
    channelRef: incoming.channelRef,
    participantId: incoming.participantId,
    messageId: "message:one",
  });
  it("observes actual source creation without creating a source record or missing admission during acquisition", async () => {
    const f = await fixture();
    const incoming = messageDelivery("source-observer");
    const wait = waitForNativeChannelSourceMessageAt(
      f.harness,
      address(incoming),
      context,
    );
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "input", content: "hello" },
      context,
    );
    expect(await wait).toMatchObject({
      submissionType: "input",
      submissionId: admitted.submissionId,
      conversationId: f.conversation.id,
    });
  });
  it("returns genuine quiet write admission without inventing model input, editability or read obligations", async () => {
    const receipts: unknown[] = [];
    const f = await fixture(undefined, {
      prepareCommit: (tx, staged) =>
        prepareNativeChannelReadReceipts(
          tx,
          staged.submissions,
          async (receipt) => {
            receipts.push(receipt);
          },
        ),
    });
    const incoming = messageDelivery("quiet-observer");
    const wait = waitForNativeChannelSourceMessageAt(
      f.harness,
      address(incoming),
      context,
    );
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "observation", entry: { kind: "test.quiet-message" } },
      context,
    );
    expect(await wait).toMatchObject({
      submissionType: "write",
      submissionId: admitted.submissionId,
      entryId: null,
      readProjected: false,
    });
    expect(
      await retainedNativeChannelSourceMessageAt(
        f.harness,
        address(incoming),
        context,
      ),
    ).toBeNull();
    const submission = await f.harness.submission(
      admitted.submissionId,
      context,
    );
    expect(await submission!.wait(context)).toMatchObject({
      type: "write",
      status: "done",
    });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("quiet-edit", "message.edited", 11),
      { kind: "message-edit", content: "corrected passive fact" },
      context,
    );
    const entries = (await f.conversation.entries({}, 20, undefined, context))
      .items;
    expect(
      entries.find(
        (entry) => entry.kind === "vibestudio.channel-message-correction",
      )?.data,
    ).toMatchObject({ result: "not_input" });
    expect(receipts).toEqual([]);
  });
  it("joins cancellation of only the observer and removes actual subscriptions", async () => {
    const f = await fixture();
    const incoming = messageDelivery("cancel-observer");
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const subscribe = f.harness.subscribeCommits.bind(f.harness);
    vi.spyOn(f.harness, "subscribeCommits").mockImplementation((listener) => {
      const dispose = vi.fn(subscribe(listener));
      disposals.push(dispose);
      return dispose;
    });
    const controller = new AbortController();
    const original = new Error("observer cancelled");
    const wait = waitForNativeChannelSourceMessageAt(
      f.harness,
      address(incoming),
      { ...context, abortSignal: controller.signal },
    );
    controller.abort(original);
    await expect(wait).rejects.toBe(original);
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "input", content: "still valid" },
      context,
    );
    expect(
      await waitForNativeChannelSourceMessageAt(
        f.harness,
        address(incoming),
        context,
      ),
    ).toMatchObject({ submissionId: admitted.submissionId });
  });
  it("settles missing source observation on authoritative Session close", async () => {
    const f = await fixture();
    const wait = waitForNativeChannelSourceMessageAt(
      f.harness,
      address(messageDelivery("closing-observer")),
      context,
    );
    const outcome = expect(wait).rejects.toThrow(/closed/i);
    await f.harness.close(context);
    await outcome;
  });
});

describe("native product channel admission", () => {
  it("pins product metadata in the original native input Tx once, before mutable replay hooks can run", async () => {
    const f = await fixture();
    const incoming = delivery("product-input");
    const commits: { submissionId: number; deliveryId: string }[] = [];
    const record: NonNullable<
      Parameters<typeof submitNativeChannelDelivery>[5]
    > = async (tx, admitted) => {
      commits.push({
        submissionId: admitted.submissionId,
        deliveryId: admitted.delivery.deliveryId,
      });
      (await tx.doc(ProductInputFacts, admitted.conversationId)).inputs.push({
        submissionId: admitted.submissionId,
        deliveryId: admitted.delivery.deliveryId,
        messageId:
          admitted.delivery.agenticContext.conversation.lastCompletedMessageId,
      });
    };
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "input", content: "first actual choice" },
      context,
      record,
    );
    const duplicate = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "input", content: "later mutable choice" },
      context,
      async () => {
        throw new Error("Replay must not prepare product facts again");
      },
    );
    expect(duplicate.submissionId).toBe(first.submissionId);
    expect(commits).toEqual([
      { submissionId: first.submissionId, deliveryId: incoming.deliveryId },
    ]);
    expect(
      await f.harness.snapshot(
        ProductInputFacts,
        first.conversationId,
        context,
      ),
    ).toEqual({
      inputs: [
        {
          submissionId: first.submissionId,
          deliveryId: incoming.deliveryId,
          messageId:
            incoming.agenticContext.conversation.lastCompletedMessageId,
        },
      ],
    });
    expect((await f.harness.submission(first.submissionId, context))!.id).toBe(
      first.submissionId,
    );
  });
  it("a product preparation failure rolls metadata and native source/submission admission back with its original error", async () => {
    const f = await fixture();
    const original = new Error("Original product metadata refusal");
    const incoming = delivery("product-rejected");
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        binding,
        incoming,
        { kind: "input", content: "not admitted" },
        context,
        async (tx, admitted) => {
          (
            await tx.doc(ProductInputFacts, admitted.conversationId)
          ).inputs.push({
            submissionId: admitted.submissionId,
            deliveryId: incoming.deliveryId,
            messageId: null,
          });
          throw original;
        },
      ),
    ).rejects.toBe(original);
    expect(
      await f.harness.snapshot(ProductInputFacts, f.conversation.id, context),
    ).toBeUndefined();
    expect(
      await retainedNativeChannelDelivery(
        f.harness,
        incoming.deliveryId,
        context,
      ),
    ).toBeUndefined();
    expect((await f.harness.inspect(context)).submissions).toEqual([]);
    const retry = await submitNativeChannelDelivery(
      f.harness,
      binding,
      incoming,
      { kind: "input", content: "proper retry" },
      context,
    );
    expect(retry.disposition).toBe("processed");
  });
  it("attaches concurrent repeated channel creation to one actually configured ownerless conversation", async () => {
    const f = await fixture();
    const conversations = await Promise.all(
      Array.from({ length: 8 }, () =>
        openNativeChannelConversation(
          f.harness,
          { ...binding, channelId: "channel:two" },
          f.agent,
          context,
        ),
      ),
    );
    expect(
      new Set(conversations.map((conversation) => conversation.id)).size,
    ).toBe(1);
    const records = await f.storage.scanConversations(
      {},
      10,
      undefined,
      context,
    );
    expect(records.items).toHaveLength(2);
    expect(records.items.every((record) => record.owner === undefined)).toBe(
      true,
    );
    expect(
      await f.harness.snapshot(AgentDoc, conversations[0]!.id, context),
    ).toMatchObject(f.agent);
    expect(
      (await f.storage.scanTasks({}, 10, undefined, context)).items,
    ).toEqual([]);
  });

  it("looks up only retained native conversation/channel bindings without creating or admitting work", async () => {
    const f = await fixture();
    const absent = { ...binding, channelId: "channel:absent" };
    expect(
      await lookupNativeChannelConversation(f.harness, absent, context),
    ).toBeNull();
    expect(
      (await f.storage.scanConversations({}, 10, undefined, context)).items,
    ).toHaveLength(1);
    expect(
      (await lookupNativeChannelConversation(f.harness, binding, context))?.id,
    ).toBe(f.conversation.id);
    expect(
      await retainedNativeConversationChannel(
        f.harness,
        f.conversation.id,
        context,
      ),
    ).toEqual(binding);
    await expect(
      lookupNativeChannelConversation(
        f.harness,
        { ...binding, contextId: "foreign" },
        context,
      ),
    ).rejects.toThrow("retained host context");
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toEqual([]);
  });

  it("retains actual cross-channel source identity while admitting a supervised report to its owning conversation", async () => {
    const f = await fixture();
    const source = delivery("child-report", "channel:child-addressed");
    const result = await submitNativeChannelDelivery(
      f.harness,
      binding,
      source,
      { kind: "input", content: "Child completed its task" },
      context,
    );
    expect(result.conversationId).toBe(f.conversation.id);
    expect(
      await retainedNativeChannelDelivery(
        f.harness,
        source.deliveryId,
        context,
      ),
    ).toMatchObject({
      sourceChannelId: source.channelId,
      targetChannelId: binding.channelId,
      conversationId: f.conversation.id,
      submissionId: result.submissionId,
    });
    expect(
      (
        await submitNativeChannelDelivery(
          f.harness,
          binding,
          source,
          { kind: "input", content: "Child completed its task" },
          context,
        )
      ).disposition,
    ).toBe("duplicate");
    const target = { ...binding, channelId: "channel:other-owner-thread" };
    await openNativeChannelConversation(f.harness, target, f.agent, context);
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        target,
        source,
        { kind: "input", content: "Child completed its task" },
        context,
      ),
    ).rejects.toThrow("immutable admission");
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        binding,
        {
          ...source,
          deliveryId: "wrong-source",
          channelId: "source-substitution",
        },
        { kind: "input", content: "wrong" },
        context,
      ),
    ).rejects.toThrow("immutable routing identity");
  });

  it("records queued native admission facts once before placement, while passive observations and feedback cannot create input signals", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("first"),
      { kind: "input", content: "first" },
      context,
    );
    const queued = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("queued"),
      { kind: "input", content: "queued" },
      context,
    );
    const record = await f.storage.submission(queued.submissionId, context);
    expect(record?.status).toBe("queued");
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("queued"),
      { kind: "input", content: "queued" },
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("observation"),
      { kind: "observation", entry: { kind: "test.observation" } },
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback"),
      feedback("card:source"),
      context,
    );
    const entries = (
      await f.storage.scanEntries(
        { conversationId: f.conversation.id },
        30,
        undefined,
        context,
      )
    ).items;
    const facts = entries.filter(
      (entry) => entry.kind === NATIVE_CHANNEL_INPUT_ADMITTED_KIND,
    );
    expect(facts).toHaveLength(2);
    expect(
      facts.filter(
        (entry) =>
          entry.data !== null &&
          typeof entry.data === "object" &&
          !Array.isArray(entry.data) &&
          entry.data?.["submissionId"] === queued.submissionId,
      ),
    ).toHaveLength(1);
    expect(facts.every((entry) => entry.model === undefined)).toBe(true);
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: queued.submissionId, content: "queued" }),
      ]),
    );
  });

  it("rejects foreign contexts and an already retired host owner without creating source state", async () => {
    const f = await fixture();
    await expect(
      openNativeChannelConversation(
        f.harness,
        { ...binding, contextId: "context:foreign" },
        f.agent,
        context,
      ),
    ).rejects.toThrow("retained host context");
    await expect(
      openNativeChannelConversation(
        f.harness,
        { channelId: "channel:foreign", contextId: "context:foreign" },
        f.agent,
        context,
      ),
    ).rejects.toThrow("retained host context");
    await retireBoundAgentSession(f.harness, context);
    await expect(
      openNativeChannelConversation(f.harness, binding, f.agent, context),
    ).rejects.toThrow("existing host-bound owner");
    expect(
      (await f.storage.scanConversations({}, 10, undefined, context)).items,
    ).toHaveLength(1);
  });

  it("rolls back both the channel directory and native creation/configuration on definitive rejection", async () => {
    const f = await fixture();
    f.storage.rejectConversation = true;
    const second = { ...binding, channelId: "channel:two" };
    await expect(
      openNativeChannelConversation(f.harness, second, f.agent, context),
    ).rejects.toBe(f.storage.original);
    expect(
      (await f.storage.scanConversations({}, 10, undefined, context)).items,
    ).toHaveLength(1);
    const recovered = await openNativeChannelConversation(
      f.harness,
      second,
      f.agent,
      context,
    );
    expect(
      (await f.storage.scanConversations({}, 10, undefined, context)).items,
    ).toHaveLength(2);
    expect(
      await f.harness.snapshot(AgentDoc, recovered.id, context),
    ).toMatchObject(f.agent);
  });

  it("atomically admits concurrent duplicates with one real native submission and exact product identity", async () => {
    const f = await fixture();
    const input = { kind: "input" as const, content: "hello" };
    const admitted = await Promise.all(
      Array.from({ length: 6 }, () =>
        submitNativeChannelDelivery(
          f.harness,
          binding,
          delivery("same"),
          input,
          context,
        ),
      ),
    );
    expect(new Set(admitted.map((record) => record.submissionId)).size).toBe(1);
    expect(
      admitted.filter((record) => record.disposition === "processed"),
    ).toHaveLength(1);
    const records = await f.storage.scanSubmissions({}, 10, undefined, context);
    expect(records.items).toHaveLength(1);
    expect(records.items[0]).toMatchObject({
      id: admitted[0]!.submissionId,
      requestId: "same",
      conversationId: f.conversation.id,
    });
    expect(
      await retainedNativeChannelDelivery(f.harness, "same", context),
    ).toMatchObject({
      submissionId: admitted[0]!.submissionId,
      conversationId: f.conversation.id,
      sourceChannelId: binding.channelId,
      targetChannelId: binding.channelId,
      contextId: binding.contextId,
    });
  });

  it("replays original admission before mutable policy and retains first chosen intake across concurrent policy selection", async () => {
    const f = await fixture();
    const source = delivery("policy-race");
    expect(
      await verifyNativeChannelDeliveryReplay(f.harness, source, context),
    ).toBeNull();
    const results = await Promise.all([
      submitNativeChannelDelivery(
        f.harness,
        binding,
        source,
        { kind: "input", content: "first policy" },
        context,
      ),
      submitNativeChannelDelivery(
        f.harness,
        binding,
        source,
        { kind: "input", content: "later policy" },
        context,
      ),
    ]);
    expect(new Set(results.map((result) => result.submissionId)).size).toBe(1);
    expect(
      results.filter((result) => result.disposition === "processed"),
    ).toHaveLength(1);
    const retained = await retainedNativeChannelDelivery(
      f.harness,
      source.deliveryId,
      context,
    );
    expect(retained?.intake).toEqual({
      kind: "input",
      content: "first policy",
    });
    expect(
      await verifyNativeChannelDeliveryReplay(f.harness, source, context),
    ).toEqual({
      conversationId: f.conversation.id,
      submissionId: results[0]!.submissionId,
      disposition: "duplicate",
    });
    expect(
      (
        await submitNativeChannelDelivery(
          f.harness,
          binding,
          source,
          { kind: "input", content: "changed policy" },
          context,
        )
      ).disposition,
    ).toBe("duplicate");
    expect(
      (
        await retainedNativeChannelDelivery(
          f.harness,
          source.deliveryId,
          context,
        )
      )?.intake,
    ).toEqual(retained?.intake);
    await expect(
      verifyNativeChannelDeliveryReplay(
        f.harness,
        { ...source, eventSequence: 999 },
        context,
      ),
    ).rejects.toThrow("immutable admission");
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toHaveLength(1);
  });

  it("retains the first canonical selection when concurrent response policy chooses different native submission kinds", async () => {
    const f = await fixture();
    const source = delivery("cross-kind-policy");
    const chosen = await Promise.all([
      submitNativeChannelDelivery(
        f.harness,
        binding,
        source,
        { kind: "observation", entry: { kind: "test.first-policy" } },
        context,
      ),
      submitNativeChannelDelivery(
        f.harness,
        binding,
        source,
        { kind: "input", content: "later response" },
        context,
      ),
    ]);
    expect(new Set(chosen.map((record) => record.submissionId)).size).toBe(1);
    expect(
      chosen.filter((record) => record.disposition === "processed"),
    ).toHaveLength(1);
    expect(
      (
        await retainedNativeChannelDelivery(
          f.harness,
          source.deliveryId,
          context,
        )
      )?.intake,
    ).toEqual({ kind: "observation", entry: { kind: "test.first-policy" } });
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toMatchObject([{ type: "write" }]);
    expect(
      (await f.storage.scanTasks({}, 10, undefined, context)).items,
    ).toEqual([]);
  });

  it.each(["envelope", "sequence", "context", "channel"] as const)(
    "rejects immutable %s substitution for an already admitted request",
    async (field) => {
      const f = await fixture();
      const first = delivery("immutable");
      const input = { kind: "input" as const, content: "original" };
      const admitted = await submitNativeChannelDelivery(
        f.harness,
        binding,
        first,
        input,
        context,
      );
      let changed = structuredClone(first);
      let intake = input;
      let bound = binding;
      if (field === "envelope")
        changed = {
          ...changed,
          envelope: { kind: "log", event: { payload: "different" } },
        };
      if (field === "sequence") changed = { ...changed, eventSequence: 5 };
      if (field === "context")
        changed.agenticContext.channelConfig.title = "different";
      if (field === "channel") {
        bound = { ...binding, channelId: "channel:two" };
        await openNativeChannelConversation(f.harness, bound, f.agent, context);
        changed = delivery("immutable", bound.channelId);
      }
      await expect(
        submitNativeChannelDelivery(f.harness, bound, changed, intake, context),
      ).rejects.toThrow("immutable admission");
      expect(
        (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
      ).toHaveLength(1);
      expect(
        (await retainedNativeChannelDelivery(f.harness, "immutable", context))
          ?.submissionId,
      ).toBe(admitted.submissionId);
    },
  );

  it("fences two racing envelopes that share a delivery ID before any second semantic admission", async () => {
    const f = await fixture();
    const input = { kind: "input" as const, content: "same" };
    const results = await Promise.allSettled([
      submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("race"),
        input,
        context,
      ),
      submitNativeChannelDelivery(
        f.harness,
        binding,
        { ...delivery("race"), eventSequence: 99 },
        input,
        context,
      ),
    ]);
    expect(
      results.filter((record) => record.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((record) => record.status === "rejected"),
    ).toMatchObject([
      {
        reason: {
          message:
            "Native channel delivery conflicts with its immutable admission",
        },
      },
    ]);
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toHaveLength(1);
  });

  it("passively records observations and feedback without independent generation", async () => {
    const f = await fixture();
    const observation = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("observed"),
      {
        kind: "observation",
        entry: { kind: "test.presence", data: { online: true } },
      },
      context,
    );
    const diagnostic = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback"),
      feedback("card:one"),
      context,
    );
    await f.harness.runPass(context);
    expect(
      (await f.storage.scanTasks({}, 10, undefined, context)).items,
    ).toEqual([]);
    expect(f.faux.state.callCount).toBe(0);
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toMatchObject([
      { id: observation.submissionId, type: "write", status: "done" },
      { id: diagnostic.submissionId, type: "write", status: "done" },
    ]);
  });

  it("queues busy inputs in the native inbox and consumes diagnostic feedback exactly once in the accepted payload", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("first"),
      { kind: "input", content: "first" },
      context,
    );
    await f.harness.runPass(context);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback-one"),
      feedback("card:one"),
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback-duplicate"),
      feedback("card:one"),
      context,
    );
    const next = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("next"),
      { kind: "input", content: "next" },
      context,
    );
    const after = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("after"),
      { kind: "input", content: [{ type: "text", text: "after" }] },
      context,
    );
    const inbox = await f.harness.snapshot(
      InboxDoc,
      f.conversation.id,
      context,
    );
    expect(
      inbox?.items.filter((item) => item.mode === "followUp"),
    ).toMatchObject([
      {
        id: next.submissionId,
        content: expect.stringContaining("Failure card:one"),
      },
      { id: after.submissionId, content: [{ type: "text", text: "after" }] },
    ]);
    expect(
      (await retainedNativeChannelDelivery(f.harness, "next", context))
        ?.feedbackOccurrenceKeys,
    ).toEqual(["card:one"]);
    expect(
      (await retainedNativeChannelDelivery(f.harness, "after", context))
        ?.feedbackOccurrenceKeys,
    ).toEqual([]);
    expect(
      await submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("next"),
        { kind: "input", content: "next" },
        context,
      ),
    ).toMatchObject({
      submissionId: next.submissionId,
      disposition: "duplicate",
    });
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items,
    ).toEqual(inbox?.items);
  });

  it("busy rejection and native transaction rejection consume neither feedback nor product admission", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("first"),
      { kind: "input", content: "first" },
      context,
    );
    await f.harness.runPass(context);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("diagnostic"),
      feedback("retained"),
      context,
    );
    const prepareProduct = vi.fn();
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("rejected-busy"),
        { kind: "input", content: "reject", whenBusy: "reject" },
        context,
        prepareProduct,
      ),
    ).rejects.toMatchObject({ name: "ConversationBusy" });
    expect(prepareProduct).not.toHaveBeenCalled();
    expect(
      await retainedNativeChannelDelivery(f.harness, "rejected-busy", context),
    ).toBeUndefined();
    f.storage.requestId = "rejected-transaction";
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("rejected-transaction"),
        { kind: "input", content: "retry" },
        context,
      ),
    ).rejects.toBe(f.storage.original);
    expect(
      await retainedNativeChannelDelivery(
        f.harness,
        "rejected-transaction",
        context,
      ),
    ).toBeUndefined();
    const retried = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("rejected-transaction"),
      { kind: "input", content: "retry" },
      context,
    );
    expect(
      (
        await retainedNativeChannelDelivery(
          f.harness,
          "rejected-transaction",
          context,
        )
      )?.feedbackOccurrenceKeys,
    ).toEqual(["retained"]);
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode === "followUp"),
    ).toMatchObject([
      {
        id: retried.submissionId,
        content: expect.stringContaining("Failure retained"),
      },
    ]);
  });

  it("retains the newest twenty feedback obligations and permits a later recurring diagnostic", async () => {
    const f = await fixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    for (let index = 0; index < 22; index++)
      await submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery(`feedback-${index}`),
        feedback(`card:${index}`),
        context,
      );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("consume"),
      { kind: "input", content: "go" },
      context,
    );
    expect(
      (await retainedNativeChannelDelivery(f.harness, "consume", context))
        ?.feedbackOccurrenceKeys,
    ).toEqual(Array.from({ length: 20 }, (_, index) => `card:${index + 2}`));
    vi.setSystemTime(new Date("2026-10-01T00:11:00Z"));
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("recurring"),
      feedback("card:21"),
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("consume-recurring"),
      { kind: "input", content: "again" },
      context,
    );
    expect(
      (
        await retainedNativeChannelDelivery(
          f.harness,
          "consume-recurring",
          context,
        )
      )?.feedbackOccurrenceKeys,
    ).toEqual(["card:21"]);
  });
  it("reattached mailbox revisions replay the first source event and target without another input", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("busy-revision"),
      { kind: "input", content: "busy" },
      context,
    );
    await f.harness.runPass(context);
    const original = delivery("original-revision");
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "first selection" },
      context,
    );
    const reattached = {
      ...original,
      deliveryId: "reattached-revision",
      subscriptionRevision: original.subscriptionRevision + 2,
    };
    expect(
      await verifyNativeChannelDeliveryReplay(f.harness, reattached, context),
    ).toMatchObject({
      submissionId: first.submissionId,
      disposition: "duplicate",
    });
    expect(
      await submitNativeChannelDelivery(
        f.harness,
        binding,
        reattached,
        { kind: "input", content: "later policy" },
        context,
      ),
    ).toMatchObject({
      submissionId: first.submissionId,
      disposition: "duplicate",
    });
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items,
    ).toMatchObject([{ id: first.submissionId, content: "first selection" }]);
    await expect(
      verifyNativeChannelDeliveryReplay(
        f.harness,
        {
          ...reattached,
          envelope: {
            kind: "log",
            event: {
              ...(original.envelope as { event: Record<string, unknown> })
                .event,
              changed: true,
            },
          },
        },
        context,
      ),
    ).rejects.toThrow(/source event conflicts/);
    await expect(
      verifyNativeChannelDeliveryReplay(
        f.harness,
        { ...reattached, eventSequence: 999 },
        context,
      ),
    ).rejects.toThrow(/source event conflicts/);
    await expect(
      verifyNativeChannelDeliveryReplay(
        f.harness,
        {
          ...reattached,
          agenticContext: {
            ...reattached.agenticContext,
            channelConfig: { title: "changed" },
          },
        },
        context,
      ),
    ).rejects.toThrow(/source event conflicts/);
  });

  it("queued author edits update the actual input, keep admission identity and consumed feedback, and retract cannot resurrect", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback-before-message"),
      feedback("edit-diagnostic"),
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("busy-before-message"),
      { kind: "input", content: "busy" },
      context,
    );
    await f.harness.runPass(context);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback-second-before-message"),
      feedback("edit-diagnostic-second"),
      context,
    );
    const original = messageDelivery("message-original");
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    expect(
      await f.storage.submission(first.submissionId, context),
    ).toMatchObject({ status: "queued" });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("foreign-edit", "message.edited", 11, "user:foreign"),
      { kind: "message-edit", content: "foreign" },
      context,
    );
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items
        .filter((item) => item.mode !== "write")
        .find((item) => item.id === first.submissionId)?.content,
    ).toEqual(expect.stringContaining("original"));
    const foreignAudit = (
      await f.conversation.entries({}, 100, undefined, context)
    ).items.find(
      (entry) => entry.kind === "vibestudio.channel-message-correction",
    );
    expect(foreignAudit?.data).toMatchObject({ result: "unauthorized" });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("message-edit", "message.edited", 12),
      { kind: "message-edit", content: "corrected" },
      context,
    );
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode !== "write"),
    ).toMatchObject([
      {
        id: first.submissionId,
        content: expect.stringContaining("Failure edit-diagnostic-second"),
      },
    ]);
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items
        .filter((item) => item.mode !== "write")
        .find((item) => item.id === first.submissionId)?.content,
    ).toEqual(expect.stringContaining("corrected"));
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("stale-edit", "message.edited", 11),
      { kind: "message-edit", content: "stale" },
      context,
    );
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items
        .filter((item) => item.mode !== "write")
        .find((item) => item.id === first.submissionId)?.content,
    ).toEqual(expect.stringContaining("corrected"));
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("message-retract", "message.retracted", 13),
      { kind: "message-retract" },
      context,
    );
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode !== "write"),
    ).toEqual([]);
    expect(
      await f.storage.submission(first.submissionId, context),
    ).toMatchObject({ status: "unanswered", reason: "aborted" });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("late-edit", "message.edited", 14),
      { kind: "message-edit", content: "resurrect" },
      context,
    );
    expect(
      await submitNativeChannelDelivery(
        f.harness,
        binding,
        original,
        { kind: "input", content: "original" },
        context,
      ),
    ).toMatchObject({
      submissionId: first.submissionId,
      disposition: "duplicate",
    });
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode !== "write"),
    ).toEqual([]);
  });

  it("originating-input inspection creates no attribution for queued source, passive history or initiated inputs", async () => {
    const f = await fixture(new RejectingStorage(), {
      prepareCommit: (tx, staged) =>
        prepareNativeChannelReadReceipts(
          tx,
          staged.submissions,
          async () => {},
        ),
    });
    const initiated = await f.conversation.submit(
      { type: "input", content: "domain initiated" },
      context,
    );
    await f.harness.runPass(context);
    expect(
      await retainedNativeChannelOriginatingInput(
        f.harness,
        initiated.id,
        context,
      ),
    ).toBeNull();
    const passive = await f.conversation.submit(
      {
        type: "write",
        entry: {
          kind: "pi.user",
          model: [{ role: "user", content: "passive history", timestamp: 1 }],
        },
      },
      context,
    );
    expect(
      await retainedNativeChannelOriginatingInput(
        f.harness,
        passive.id,
        context,
      ),
    ).toBeNull();
    const queued = await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("queued-origin"),
      { kind: "input", content: "not placed", whenBusy: "followUp" },
      context,
    );
    const before = await f.harness.inspect(context);
    expect(
      await retainedNativeChannelOriginatingInput(
        f.harness,
        queued.submissionId,
        context,
      ),
    ).toBeNull();
    expect(await f.harness.inspect(context)).toEqual(before);
    expect(
      (
        await (await f.harness.submission(
          queued.submissionId,
          context,
        ))!.status(context)
      ).status,
    ).toBe("queued");
  });

  it("placed input read-wins, correction stays passive, and read acknowledgement follows exact same-transaction native entry", async () => {
    const reads: { messageId: string; entryId: EntryId }[] = [];
    const f = await fixture(new RejectingStorage(), {
      prepareCommit: async (tx, staged) =>
        prepareNativeChannelReadReceipts(
          tx,
          staged.submissions,
          async (receipt) => {
            reads.push({
              messageId: receipt.messageId,
              entryId: receipt.entryId,
            });
            await tx.appendEntry(receipt.conversationId, {
              kind: "test.retained-read",
              data: { ...receipt },
            });
          },
        ),
    });
    const original = messageDelivery("read-original");
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    await f.harness.runPass(context);
    const placed = await f.storage.submission(first.submissionId, context);
    expect(placed?.status).toBe("placed");
    const source = await retainedNativeChannelSourceMessage(
      f.harness,
      original,
      "message:one",
      context,
    );
    expect(source).toMatchObject({
      submissionId: first.submissionId,
      entryId: placed?.entry,
      readProjected: true,
      originalSequence: 10,
      placedContentSequence: 10,
    });
    expect(reads).toEqual([
      { messageId: "message:one", entryId: placed?.entry },
    ]);
    const originating = await retainedNativeChannelOriginatingInput(
      f.harness,
      first.submissionId,
      context,
    );
    expect(originating).toEqual({
      conversationId: f.conversation.id,
      submissionId: first.submissionId,
      entryId: placed?.entry,
      channelRef: original.channelRef,
      eventSequence: 10,
      envelopeId: "source-event:read-original",
      messageId: "message:one",
      receiverParticipantId: original.participantId,
    });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("read-late-edit", "message.edited", 11),
      { kind: "message-edit", content: "later correction" },
      context,
    );
    await f.harness.runPass(context);
    expect(
      await retainedNativeChannelOriginatingInput(
        f.harness,
        first.submissionId,
        context,
      ),
    ).toEqual(originating);
    expect(
      (await f.storage.entry(placed!.entry!, context))?.entry,
    ).toMatchObject({
      model: [{ role: "user", content: "original" }],
    });
    expect(reads).toHaveLength(1);
    expect(
      await retainedNativeChannelSourceMessage(
        f.harness,
        original,
        "message:one",
        context,
      ),
    ).toMatchObject({
      originalSequence: 10,
      sequence: 11,
      contentSequence: 10,
      placedContentSequence: 10,
    });
  });

  it("rejected queued correction rolls back source sequence, actual inbox, passive audit and delivery ownership together", async () => {
    const f = await fixture();
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("rollback-busy"),
      { kind: "input", content: "busy" },
      context,
    );
    await f.harness.runPass(context);
    const original = messageDelivery("rollback-original");
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    f.storage.requestId = "rollback-edit";
    const edit = messageDelivery("rollback-edit", "message.edited", 11);
    await expect(
      submitNativeChannelDelivery(
        f.harness,
        binding,
        edit,
        { kind: "message-edit", content: "corrected" },
        context,
      ),
    ).rejects.toBe(f.storage.original);
    expect(
      await retainedNativeChannelDelivery(f.harness, edit.deliveryId, context),
    ).toBeUndefined();
    expect(
      await retainedNativeChannelSourceMessage(
        f.harness,
        original,
        "message:one",
        context,
      ),
    ).toMatchObject({ sequence: 10 });
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode !== "write"),
    ).toMatchObject([{ id: first.submissionId, content: "original" }]);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      edit,
      { kind: "message-edit", content: "corrected" },
      context,
    );
    expect(
      (
        await f.harness.snapshot(InboxDoc, f.conversation.id, context)
      )?.items.filter((item) => item.mode !== "write"),
    ).toMatchObject([{ id: first.submissionId, content: "corrected" }]);
  });
  it("binds a genuinely staged ownerless history conversation atomically and rejects foreign or conflicting directories", async () => {
    const f = await fixture();
    const target = { ...binding, channelId: "channel:history" };
    const id = await f.harness.commit(async (tx) => {
      const fork = await tx.createConversation({
        ownership: { kind: "ownerless" },
      });
      await bindNativeChannelConversation(tx, fork.id, target);
      return fork.id;
    }, context);
    expect(
      (await lookupNativeChannelConversation(f.harness, target, context))?.id,
    ).toBe(id);
    expect(
      await retainedNativeConversationChannel(f.harness, id, context),
    ).toEqual(target);
    await expect(
      f.harness.commit(
        (tx) => bindNativeChannelConversation(tx, f.conversation.id, target),
        context,
      ),
    ).rejects.toThrow(/conflicts/);
    await expect(
      f.harness.commit(
        (tx) =>
          bindNativeChannelConversation(tx, id, {
            ...target,
            contextId: "foreign",
          }),
        context,
      ),
    ).rejects.toThrow(/retained host context/);
    await expect(
      f.harness.commit(
        (tx) =>
          bindNativeChannelConversation(tx, id, {
            ...binding,
            channelId: "channel:other",
          }),
        context,
      ),
    ).rejects.toThrow(/already belongs/);
    expect(
      (await f.storage.scanSubmissions({}, 10, undefined, context)).items,
    ).toEqual([]);
  });

  it("looks up placed native source messages by their real channel address without a fabricated mailbox delivery", async () => {
    const f = await fixture();
    const original = messageDelivery("address-only");
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    const address = {
      channelRef: original.channelRef,
      participantId: original.participantId,
      messageId: "message:one",
    };
    expect(
      await retainedNativeChannelSourceMessageAt(f.harness, address, context),
    ).toMatchObject({
      submissionId: admitted.submissionId,
      conversationId: admitted.conversationId,
    });
    expect(
      await retainedNativeChannelSourceMessageAt(
        f.harness,
        { ...address, messageId: "unknown" },
        context,
      ),
    ).toBeNull();
    expect(
      await retainedNativeChannelSourceMessageAt(
        f.harness,
        { ...address, participantId: "other" },
        context,
      ),
    ).toBeNull();
    await expect(
      retainedNativeChannelSourceMessageAt(
        f.harness,
        { ...address, channelRef: { ...address.channelRef, objectKey: "" } },
        context,
      ),
    ).rejects.toThrow(/canonical address/);
  });
  it("pins the actual queued content revision at placement, independently of later passive corrections", async () => {
    const f = await fixture(new RejectingStorage(), {
      modelRequests: async (request, api) => {
        await api.prepare(request.model, context);
        return { status: "ready", options: {}, close: async () => {} };
      },
      prepareCommit: (tx, staged) =>
        prepareNativeChannelReadReceipts(
          tx,
          staged.submissions,
          async (receipt) => {
            await tx.appendEntry(receipt.conversationId, {
              kind: "test.read-debt",
              data: { ...receipt },
            });
          },
        ),
    });
    f.faux.setResponses([
      fauxAssistantMessage("first reply"),
      fauxAssistantMessage("corrected reply"),
    ]);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("frontier-first"),
      { kind: "input", content: "first" },
      context,
    );
    const original = messageDelivery("frontier-source");
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("frontier-edit", "message.edited", 12),
      { kind: "message-edit", content: "corrected" },
      context,
    );
    await f.harness.runPass(context);
    const placed = await f.storage.submission(admitted.submissionId, context);
    expect(placed).toMatchObject({ status: "done" });
    expect(
      (await f.storage.entry(placed!.entry!, context))?.entry,
    ).toMatchObject({ model: [{ role: "user", content: "corrected" }] });
    expect(
      await retainedNativeChannelSourceMessageAt(
        f.harness,
        {
          channelRef: original.channelRef,
          participantId: original.participantId,
          messageId: "message:one",
        },
        context,
      ),
    ).toMatchObject({
      originalSequence: 10,
      contentSequence: 12,
      placedContentSequence: 12,
      entryId: placed?.entry,
    });
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("frontier-late", "message.edited", 15),
      { kind: "message-edit", content: "too late" },
      context,
    );
    expect(
      await retainedNativeChannelSourceMessageAt(
        f.harness,
        {
          channelRef: original.channelRef,
          participantId: original.participantId,
          messageId: "message:one",
        },
        context,
      ),
    ).toMatchObject({
      sequence: 15,
      placedContentSequence: 12,
      contentSequence: 12,
    });
  });
  it("pins exact consumed feedback frontiers without comparing unrelated channel clocks or lowering a corrected input frontier", async () => {
    let modelReady = false;
    const f = await fixture(new RejectingStorage(), {
      modelRequests: async (request, api) => {
        if (!modelReady)
          return {
            status: "waiting",
            condition: {
              kind: "input",
              conversationId: request.conversationId,
              after: request.cutoff,
              kinds: ["test.model-ready"],
            },
          };
        await api.prepare(request.model, context);
        return { status: "ready", options: {}, close: async () => {} };
      },
      prepareCommit: (tx, staged) =>
        prepareNativeChannelReadReceipts(
          tx,
          staged.submissions,
          async (receipt) => {
            await tx.appendEntry(receipt.conversationId, {
              kind: "test.read-frontiers",
              data: { ...receipt },
            });
          },
        ),
    });
    f.faux.setResponses([
      fauxAssistantMessage("first"),
      fauxAssistantMessage("next"),
    ]);
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("feedback-frontier-busy"),
      { kind: "input", content: "busy" },
      context,
    );
    await f.harness.runPass(context);
    const ownFeedback = {
      ...delivery("feedback-frontier-own"),
      eventSequence: 20,
    };
    const foreignFeedback = {
      ...delivery("feedback-frontier-other", "channel:other"),
      eventSequence: 99,
    };
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      ownFeedback,
      feedback("frontier-own"),
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      foreignFeedback,
      feedback("frontier-other"),
      context,
    );
    const original = messageDelivery("feedback-frontier-input");
    const admitted = await submitNativeChannelDelivery(
      f.harness,
      binding,
      original,
      { kind: "input", content: "original" },
      context,
    );
    await submitNativeChannelDelivery(
      f.harness,
      binding,
      messageDelivery("feedback-frontier-edit", "message.edited", 12),
      { kind: "message-edit", content: "corrected" },
      context,
    );
    expect(
      await f.storage.submission(admitted.submissionId, context),
    ).toMatchObject({ status: "queued" });
    expect(
      (await f.harness.snapshot(InboxDoc, f.conversation.id, context))?.items
        .filter((item) => item.mode !== "write")
        .find((item) => item.id === admitted.submissionId)?.content,
    ).toEqual(expect.stringContaining("corrected"));
    modelReady = true;
    await f.conversation.commit(
      (tx) => tx.appendEntry(f.conversation.id, { kind: "test.model-ready" }),
      context,
    );
    await f.harness.runPass(context);
    const placed = await f.storage.submission(admitted.submissionId, context);
    expect(placed?.status).toBe("done");
    const source = await retainedNativeChannelSourceMessageAt(
      f.harness,
      {
        channelRef: original.channelRef,
        participantId: original.participantId,
        messageId: "message:one",
      },
      context,
    );
    expect(source).toMatchObject({
      originalSequence: 10,
      contentSequence: 20,
      placedContentSequence: 20,
      placedFeedbackFrontiers: [
        { channelRef: ownFeedback.channelRef, sequence: 20 },
        { channelRef: foreignFeedback.channelRef, sequence: 99 },
      ],
    });
    expect(
      (await f.storage.entry(placed!.entry!, context))?.entry.model?.[0]
        ?.content,
    ).toEqual(expect.stringContaining("Failure frontier-own"));
    expect(
      (await f.storage.entry(placed!.entry!, context))?.entry.model?.[0]
        ?.content,
    ).toEqual(expect.stringContaining("Failure frontier-other"));
    expect(
      (await f.storage.entry(placed!.entry!, context))?.entry.model?.[0]
        ?.content,
    ).toEqual(expect.stringContaining("corrected"));
  });
});

describe("ui feedback repair turns", () => {
  /** Model calls are ready while `ready` allows; later generations wait (a busy run). */
  async function repairFixture<S extends Storage = RejectingStorage>(
    storage: S = new RejectingStorage() as Storage as S,
    ready = Infinity,
  ) {
    let calls = 0;
    const f = await fixture(storage, {
      modelRequests: async (request, api) => {
        if (calls++ >= ready)
          return {
            status: "waiting",
            condition: {
              kind: "input",
              conversationId: request.conversationId,
              after: request.cutoff,
              kinds: ["test.model-ready"],
            },
          };
        await api.prepare(request.model, context);
        return { status: "ready", options: {}, close: async () => {} };
      },
    });
    return f;
  }
  type Fixture = { conversation: { id: ConversationId }; storage: Storage };
  function turnOf(
    f: Fixture,
    submissionId: SubmissionId,
  ): TurnId {
    return nativeTurnId(f.conversation.id, submissionId);
  }
  function failureOf(occurrenceKey: string, turnId: TurnId): NativeChannelIntake {
    const intake = feedback(occurrenceKey);
    if (intake.kind !== "feedback") throw new Error("unreachable");
    return {
      kind: "feedback",
      payload: {
        ...intake.payload,
        category: "props_invalid",
        refs: { messageId: `message:${occurrenceKey}` as never, component: "Calculator", turnId },
      },
    };
  }
  async function placedText(
    f: Fixture,
    submissionId: number,
  ): Promise<string> {
    const record = await f.storage.submission(submissionId as never, context);
    const content = (await f.storage.entry(record!.entry!, context))?.entry
      .model?.[0]?.content;
    return typeof content === "string" ? content : JSON.stringify(content);
  }
  async function submissionType(
    f: Fixture,
    submissionId: number,
  ) {
    return (await f.storage.submission(submissionId as never, context))?.type;
  }

  it("wakes an idle agent once, as a UI notice, for a failure of an ordinary turn's output", async () => {
    const f = await repairFixture();
    f.faux.setResponses([
      fauxAssistantMessage("ordinary reply"),
      fauxAssistantMessage("repair reply"),
      fauxAssistantMessage("next reply"),
    ]);
    const ordinary = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("ordinary"),
      { kind: "input", content: "show a calculator" },
      context,
    );
    await f.harness.runPass(context);
    expect(f.faux.state.callCount).toBe(1);

    const woken = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure"),
      failureOf("calc:one", turnOf(f, ordinary.submissionId)),
      context,
    );
    expect(await submissionType(f, woken.submissionId)).toBe("input");
    await f.harness.runPass(context);
    expect(f.faux.state.callCount).toBe(2);
    const notice = await placedText(f, woken.submissionId);
    expect(notice).toContain("[ui-feedback] Automatic notice from the chat panel");
    expect(notice).toContain("Calculator in message message:calc:one rejected props");
    expect(
      (await retainedNativeChannelDelivery(f.harness, "failure", context))
        ?.feedbackOccurrenceKeys,
    ).toEqual(["calc:one"]);

    // Dedupe: the same occurrence never wakes or queues again.
    const duplicate = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-duplicate"),
      failureOf("calc:one", turnOf(f, ordinary.submissionId)),
      context,
    );
    // A later failure of the already repaired turn waits for the next turn.
    const later = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-later"),
      failureOf("calc:later", turnOf(f, ordinary.submissionId)),
      context,
    );
    expect(await submissionType(f, duplicate.submissionId)).toBe("write");
    expect(await submissionType(f, later.submissionId)).toBe("write");
    await f.harness.runPass(context);
    expect(f.faux.state.callCount).toBe(2);

    const next = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("next"),
      { kind: "input", content: "thanks" },
      context,
    );
    await f.harness.runPass(context);
    const nextText = await placedText(f, next.submissionId);
    expect(nextText).toContain("message:calc:later");
    expect(nextText).not.toContain("message:calc:one");
  });

  it("queues a failure of a repair turn's own output for the next ordinary turn, also after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-feedback-repair-"));
    const path = join(directory, "agent.sqlite");
    try {
      const f = await repairFixture(await openNodeSqliteStorage(path));
      f.faux.setResponses([
        fauxAssistantMessage("ordinary reply"),
        fauxAssistantMessage("repair reply"),
        fauxAssistantMessage("next reply"),
      ]);
      const ordinary = await submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("ordinary"),
        { kind: "input", content: "show a calculator" },
        context,
      );
      await f.harness.runPass(context);
      const repair = await submitNativeChannelDelivery(
        f.harness,
        binding,
        delivery("failure"),
        failureOf("calc:one", turnOf(f, ordinary.submissionId)),
        context,
      );
      await f.harness.runPass(context);
      expect(f.faux.state.callCount).toBe(2);
      await f.harness.close(context);

      const reopened = await repairFixture(await openNodeSqliteStorage(path));
      reopened.faux.setResponses([fauxAssistantMessage("next reply")]);
      expect(reopened.conversation.id).toBe(f.conversation.id);
      const repairFailure = await submitNativeChannelDelivery(
        reopened.harness,
        binding,
        delivery("repair-failure"),
        failureOf("calc:repair", turnOf(f, repair.submissionId)),
        context,
      );
      const ordinaryAgain = await submitNativeChannelDelivery(
        reopened.harness,
        binding,
        delivery("ordinary-failure-again"),
        failureOf("calc:again", turnOf(f, ordinary.submissionId)),
        context,
      );
      expect(await submissionType(reopened, repairFailure.submissionId)).toBe(
        "write",
      );
      expect(await submissionType(reopened, ordinaryAgain.submissionId)).toBe(
        "write",
      );
      await reopened.harness.runPass(context);
      expect(reopened.faux.state.callCount).toBe(0);

      const next = await submitNativeChannelDelivery(
        reopened.harness,
        binding,
        delivery("next"),
        { kind: "input", content: "and now?" },
        context,
      );
      await reopened.harness.runPass(context);
      expect(await placedText(reopened, next.submissionId)).toContain(
        "message:calc:repair",
      );
    } finally {
      await Promise.allSettled(
        sessions.splice(0).map((session) => session.close(context)),
      );
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not wake for unattributable failures or another conversation's turns", async () => {
    const f = await repairFixture();
    const foreign = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("foreign"),
      failureOf("calc:foreign", nativeTurnId(999999 as ConversationId, 1 as SubmissionId)),
      context,
    );
    const unknownInput = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("unknown-input"),
      failureOf("calc:unknown", turnOf(f, 987654 as SubmissionId)),
      context,
    );
    expect(await submissionType(f, foreign.submissionId)).toBe("write");
    expect(await submissionType(f, unknownInput.submissionId)).toBe("write");
  });

  it("while the producing turn runs, the repair follows it and later failures join the queued repair", async () => {
    const f = await repairFixture(new RejectingStorage(), 0);
    const ordinary = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("ordinary"),
      { kind: "input", content: "show two calculators" },
      context,
    );
    await f.harness.runPass(context);
    const first = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-one"),
      failureOf("calc:one", turnOf(f, ordinary.submissionId)),
      context,
    );
    const second = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-two"),
      failureOf("calc:two", turnOf(f, ordinary.submissionId)),
      context,
    );
    expect(await submissionType(f, first.submissionId)).toBe("input");
    expect(await submissionType(f, second.submissionId)).toBe("write");
    const inbox = await f.harness.snapshot(InboxDoc, f.conversation.id, context);
    const inputs = inbox!.items.filter((item) => item.mode !== "write");
    expect(inputs).toEqual([
      expect.objectContaining({ id: first.submissionId, mode: "followUp" }),
    ]);
    const queued = inputs[0] as { content: unknown };
    expect(queued.content).toEqual(expect.stringContaining("message:calc:one"));
    expect(queued.content).toEqual(expect.stringContaining("message:calc:two"));
  });

  it("a failure arriving while its repair turn runs steers into that repair turn", async () => {
    const f = await repairFixture(new RejectingStorage(), 1);
    f.faux.setResponses([fauxAssistantMessage("ordinary reply")]);
    const ordinary = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("ordinary"),
      { kind: "input", content: "show two calculators" },
      context,
    );
    await f.harness.runPass(context);
    const repair = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-one"),
      failureOf("calc:one", turnOf(f, ordinary.submissionId)),
      context,
    );
    await f.harness.runPass(context);
    expect(
      (await f.harness.snapshot(LiveDoc, f.conversation.id, context))?.run
        ?.inputs,
    ).toEqual([repair.submissionId]);
    const joined = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("failure-two"),
      failureOf("calc:two", turnOf(f, ordinary.submissionId)),
      context,
    );
    expect(await submissionType(f, joined.submissionId)).toBe("input");
    const inbox = await f.harness.snapshot(InboxDoc, f.conversation.id, context);
    expect(inbox?.items.filter((item) => item.mode !== "write")).toEqual([
      expect.objectContaining({
        id: joined.submissionId,
        mode: "steer",
        content: expect.stringContaining("message:calc:two"),
      }),
    ]);
    // Failures of the joined repair turn's output still do not wake.
    const repairFailure = await submitNativeChannelDelivery(
      f.harness,
      binding,
      delivery("repair-failure"),
      failureOf("calc:repair", turnOf(f, repair.submissionId)),
      context,
    );
    expect(await submissionType(f, repairFailure.submissionId)).toBe("write");
  });
});
