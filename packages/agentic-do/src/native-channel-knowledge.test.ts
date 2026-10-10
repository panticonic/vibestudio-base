import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  Type,
} from "@panticonic/pi-ai";
import { copyJson, type JsonValue } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  bindReceipt,
  defineExtension,
  MemoryStorage,
  InboxDoc,
  LiveDoc,
  type Harness,
  type Storage,
  type Conversation,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import type { ServerLogEvent as ChannelEvent } from "@workspace/pubsub";
import type { NativeChannelKnowledge } from "@workspace/agentic-core/native-channel-knowledge";
import { createNativeChannelBootstrap } from "./native-channel-bootstrap.js";
import { openBoundAgentSession } from "./native-agent-session.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  openNativeChannelConversation,
  lookupNativeChannelConversation,
  submitNativeChannelDelivery,
  type NativeChannelDelivery,
} from "./native-channel-session.js";
import {
  exportNativeChannelKnowledge,
  nativeChannelKnowledgeEventDigest,
  importNativeChannelKnowledge,
  retainedNativeChannelKnowledgeConfiguration,
  type NativeChannelKnowledgeSource,
} from "./native-channel-knowledge.js";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  const closed = await Promise.allSettled(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
  for (const result of closed)
    if (result.status === "rejected") throw result.reason;
});
async function fixture(name: string, storage: Storage = new MemoryStorage()) {
  const owner = {
    runtimeId: `do:workers/agent:Agent:${name}`,
    contextId: `context:${name}`,
    incarnation: `storage:${name}`,
    authoritySessionId: `authority:${name}`,
  };
  const binding = { channelId: `channel:${name}`, contextId: owner.contextId };
  const events: ChannelEvent[] = [];
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  const publication = createNativeChannelPublication({
    publish: async (_channel, participantId, event, key) => {
      if (event.kind === "message.read") return { recorded: true };
      const id = Math.max(0, ...events.map((event) => event.id)) + 1;
      events.push({
        id,
        messageId: key,
        type: AGENTIC_EVENT_PAYLOAD_KIND,
        senderId: participantId,
        payload: event,
        ts: 0,
      });
      return { id };
    },
  });
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "publication", tasks: [publication.task] }),
  );
  const harness = await openBoundAgentSession(
    storage,
    owner,
    {
      models,
      registry,
      publishWake: async () => {},
      prepareCommit: publication.prepareCommit,
      modelRequests: async () => ({
        status: "ready",
        options: {},
        close: async () => {},
      }),
    },
    context,
  );
  sessions.push(harness);
  const channelRef = {
    source: "workers/channel",
    className: "ChannelDO",
    objectKey: binding.channelId,
  };
  let reads = 0;
  function source(conversation: Conversation): NativeChannelKnowledgeSource {
    return {
      harness,
      conversation,
      binding,
      participantId: owner.runtimeId,
      channelRef,
      channel: {
        async *replayAfterPages(request) {
          reads++;
          const through =
            request.throughSeq ??
            Math.max(0, ...events.map((event) => event.id));
          const selected = events.filter(
            (event) => event.id > request.after && event.id <= through,
          );
          yield {
            mode: "after",
            logEvents: selected,
            snapshots: [],
            ready: {
              totalCount: selected.length,
              envelopeCount: selected.length,
              snapshotLastSeq: through,
              hasMoreAfter: false,
            },
          };
        },
      },
    };
  }
  async function open() {
    return openNativeChannelConversation(
      harness,
      binding,
      { model: { provider: "faux", modelId: faux.getModel().id } },
      context,
      (tx, id) =>
        publication.bind(tx, id, {
          channelId: binding.channelId,
          participantId: owner.runtimeId,
          actor: {
            kind: "agent",
            id: owner.runtimeId,
            participantId: owner.runtimeId,
          },
          policy: "all",
        }),
    );
  }
  function delivery(
    event: ChannelEvent,
    channel = channelRef,
  ): NativeChannelDelivery {
    return {
      deliveryId: `delivery:${name}:${event.messageId}`,
      channelId: channel.objectKey,
      channelRef: channel,
      participantId: owner.runtimeId,
      subscriptionRevision: 1,
      eventSequence: event.id,
      envelope: { kind: "log", event },
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
    };
  }
  async function input(
    conversation: Conversation,
    text: string,
    sequence = Math.max(0, ...events.map((event) => event.id)) + 1,
    response = fauxAssistantMessage(`reply: ${text}`),
  ) {
    const event: AgenticEvent<"message.completed"> = {
      kind: "message.completed",
      actor: { kind: "user", id: "user:one" },
      causality: { messageId: `input:${name}:${sequence}` as never },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        role: "user",
        outcome: "completed",
        blocks: [
          {
            type: "text",
            blockId: `block:${sequence}` as never,
            content: text,
          },
        ],
      },
      createdAt: "2026-10-02T00:00:00Z",
    };
    const envelope: ChannelEvent = {
      id: sequence,
      messageId: `source:${name}:${sequence}`,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "user:one",
      payload: event,
      ts: 0,
    };
    events.push(envelope);
    faux.setResponses([response]);
    await submitNativeChannelDelivery(
      harness,
      binding,
      delivery(envelope),
      { kind: "input", content: text },
      context,
    );
    await harness.runPass(context);
    return conversation;
  }
  return {
    harness,
    registry,
    faux,
    owner,
    binding,
    events,
    source,
    open,
    input,
    delivery,
    reads: () => reads,
  };
}
function importInput(
  knowledge: NativeChannelKnowledge,
  receiver: Awaited<ReturnType<typeof fixture>>,
  operationId = "import:one",
) {
  return {
    operationId,
    parentChannelId: knowledge.channelId,
    channelId: receiver.binding.channelId,
    contextId: receiver.binding.contextId,
    knowledge,
  };
}
async function completedSource() {
  const f = await fixture("source");
  const conversation = await f.open();
  await f.input(conversation, "original knowledge");
  const throughSequence = Math.max(...f.events.map((event) => event.id));
  const knowledge = await exportNativeChannelKnowledge(
    f.source(conversation),
    {
      operationId: "export:one",
      channelId: f.binding.channelId,
      throughSequence,
    },
    context,
  );
  return { ...f, conversation, knowledge };
}
describe("native channel knowledge transfer", () => {
  it("pins original domain configuration with export and atomically retains it before receiving configuration or execution", async () => {
    const source = await fixture("configuration-source");
    const conversation = await source.open();
    await source.input(conversation, "Original context");
    let reads = 0;
    let prefs = "Original user preferences";
    const sourcePort = {
      ...source.source(conversation),
      configuration: () => {
        reads++;
        return { kind: "actual-domain-settings", preferences: prefs };
      },
    };
    const request = {
      operationId: "configuration-export",
      channelId: source.binding.channelId,
      throughSequence: Math.max(...source.events.map((event) => event.id)),
    };
    const original = await exportNativeChannelKnowledge(
      sourcePort,
      request,
      context,
    );
    prefs = "Changed after the original export";
    expect(
      await exportNativeChannelKnowledge(sourcePort, request, context),
    ).toEqual(original);
    expect(reads).toBe(1);
    expect(original.configuration).toEqual({
      kind: "actual-domain-settings",
      preferences: "Original user preferences",
    });
    const receiving = await fixture("configuration-receiving");
    const imported = await importNativeChannelKnowledge(
      receiving.harness,
      importInput(original, receiving),
      {},
      context,
    );
    expect(
      await retainedNativeChannelKnowledgeConfiguration(
        receiving.harness,
        imported.id,
        context,
      ),
    ).toEqual(original.configuration);
    expect((await receiving.harness.inspect(context)).tasks).toEqual([]);
    expect((await receiving.harness.inspect(context)).submissions).toEqual([]);
  });

  it("forks genuine active spawn tool-call knowledge without copying execution or dangling provider tool protocol", async () => {
    const source = await fixture("active-spawn");
    let executed = 0;
    source.registry.install(
      defineExtension({
        name: "spawn",
        tools: [
          {
            name: "spawn",
            description: "Actual owned child wait",
            parameters: Type.Object({}),
            replay: "safe",
            execute: async (_args, api, ctx) => {
              executed++;
              await api.commit(
                (tx) =>
                  bindReceipt(
                    tx,
                    "actual-child-result",
                    "original-child-owner",
                  ),
                ctx,
              );
              return {
                wait: {
                  kind: "receipt" as const,
                  key: "actual-child-result",
                  binding: "original-child-owner",
                },
                continuation: { ownedChild: true },
              };
            },
            cancel: async () => ({
              content: [
                { type: "text" as const, text: "Original child cancelled" },
              ],
            }),
          },
        ],
      }),
    );
    const conversation = await source.open();
    await source.input(
      conversation,
      "spawn a child",
      undefined,
      fauxAssistantMessage(
        [
          {
            type: "toolCall",
            id: "actual-spawn-call",
            name: "spawn",
            arguments: {},
          },
        ],
        { stopReason: "toolUse" },
      ),
    );
    expect(executed).toBe(1);
    const tasks = (
      await source.harness.commit(
        (tx) =>
          tx.scanTasks(
            { conversationId: conversation.id, kind: "pi.tool" },
            20,
          ),
        context,
      )
    ).items;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.state).toMatchObject({
      status: "waiting",
      condition: { kind: "receipt", key: "actual-child-result" },
    });
    const throughSequence = Math.max(...source.events.map((event) => event.id));
    const knowledge = await exportNativeChannelKnowledge(
      source.source(conversation),
      {
        operationId: "actual-spawn-export",
        channelId: source.binding.channelId,
        throughSequence,
      },
      context,
    );
    const receiver = await fixture("active-spawn-child");
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      importInput(knowledge, receiver),
      { agent: { tools: [], extensions: [] } },
      context,
    );
    expect((await receiver.harness.inspect(context)).tasks).toEqual([]);
    expect((await receiver.harness.inspect(context)).submissions).toEqual([]);
    const importedContext = await imported.context(context);
    const callIndex = importedContext.messages.findIndex(
      (message) =>
        message.role === "assistant" &&
        message.content.some(
          (block) =>
            block.type === "toolCall" && block.id === "actual-spawn-call",
        ),
    );
    expect(callIndex).toBeGreaterThanOrEqual(0);
    expect(importedContext.messages[callIndex + 1]).toMatchObject({
      role: "toolResult",
      toolCallId: "actual-spawn-call",
      toolName: "spawn",
      isError: true,
      details: { reason: "missing_result" },
    });
    expect(JSON.stringify(knowledge.history)).not.toContain(
      "actual-child-result",
    );
    expect(JSON.stringify(knowledge.history)).not.toContain(
      "original-child-owner",
    );
    expect(executed).toBe(1);
    expect(
      (await source.harness.getTask(tasks[0]!.id, context))?.state.status,
    ).toBe("waiting");
    receiver.faux.setResponses([
      fauxAssistantMessage("Independent child answer"),
    ]);
    const nextInput = await imported.submit(
      { type: "input", content: "continue independently" },
      context,
    );
    await receiver.harness.runPass(context);
    expect(await nextInput.wait(context)).toMatchObject({ status: "done" });
    expect(executed).toBe(1);
    await conversation.abort(context);
  });

  it("exports passive knowledge against its exact owner-local canonical anchor", async () => {
    const source = await fixture("early-passive");
    const conversation = await source.open();
    const retained: ChannelEvent = {
      id: 1,
      messageId: "early-passive:envelope",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "user:one",
      ts: 1,
      payload: {
        kind: "message.completed",
        actor: { kind: "user", id: "one", participantId: "user:one" },
        causality: { messageId: "early-passive:message" },
        createdAt: "2026-10-02T00:00:00Z",
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          role: "user",
          outcome: "completed",
          blocks: [{ type: "text", blockId: "early-passive:block", content: "Early passive context" }],
        },
      },
    };
    const accepted = retained;
    await conversation.commit(async (tx) => {
      await tx.appendEntry(conversation.id, {
        kind: "vibestudio.channel-history",
        data: copyJson({ channelId: source.binding.channelId, event: accepted }, { omitUndefinedProperties: true }) as JsonValue,
        model: [{ role: "user", timestamp: retained.ts, content: "Early passive context" }],
      });
    }, context);
    source.events.push(retained);
    const knowledge = await exportNativeChannelKnowledge(source.source(conversation), {
      operationId: "early-passive:export",
      channelId: source.binding.channelId,
      throughSequence: 1,
    }, context);
    expect(knowledge.anchors).toEqual([expect.objectContaining({
      envelopeId: retained.messageId,
      sequence: retained.id,
      eventDigest: nativeChannelKnowledgeEventDigest(retained),
    })]);
    expect(knowledge.anchors[0]!.eventDigest).not.toBe(nativeChannelKnowledgeEventDigest({ ...retained, id: 2 }));
    expect(nativeChannelKnowledgeEventDigest(accepted)).toBe(nativeChannelKnowledgeEventDigest(retained));
    const receiver = await fixture("early-passive:receiver");
    const imported = await importNativeChannelKnowledge(receiver.harness, importInput(knowledge, receiver), {}, context);
    expect((await imported.context(context)).messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["Early passive context"]);
    expect((await receiver.harness.inspect(context)).submissions).toEqual([]);
  });

  it("exports genuine passive bootstrap context and exact committed corrections", async () => {
    const source = await fixture("passive");
    const actor = {
      kind: "user" as const,
      id: "one",
      participantId: "user:one",
    };
    const make = (
      id: number,
      kind: "message.completed" | "message.edited",
      text: string,
    ): ChannelEvent => ({
      id,
      messageId: `passive:${id}`,
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      senderId: "user:one",
      ts: id,
      payload: {
        kind,
        actor,
        causality: { messageId: "passive:message" },
        createdAt: "2026-10-02T00:00:00Z",
        payload: {
          protocol: AGENTIC_PROTOCOL_VERSION,
          blocks: [{ type: "text", blockId: "passive:block", content: text }],
          ...(kind === "message.completed"
            ? { role: "user", outcome: "completed" }
            : { by: actor }),
        },
      },
    });
    source.events.push(
      make(1, "message.completed", "original passive knowledge"),
      make(2, "message.edited", "corrected passive knowledge"),
    );
    const bootstrap = createNativeChannelBootstrap({
      join: async () => ({
        mode: "after",
        logEvents: source.events,
        snapshots: [],
        ready: {
          contextId: source.binding.contextId,
          totalCount: 2,
          envelopeCount: 2,
          snapshotLastSeq: 2,
          replayToId: 2,
          hasMoreAfter: false,
        },
      }),
      replayAfter: async () => {
        throw new Error("No extra replay page is owed");
      },
      contextForEvent: (_binding, event, projected) =>
        projected
          ? [
              {
                role: "user",
                timestamp: event.ts,
                content: (projected.blocks ?? [])
                  .map((block) => ("content" in block ? block.content : ""))
                  .join("\n"),
              },
            ]
          : [],
      prepareConfiguration: async () => async () => {},
    });
    source.registry.install(
      defineExtension({ name: "bootstrap", tasks: [bootstrap.task] }),
    );
    const conversation = await bootstrap.open(
      source.harness,
      source.binding,
      { revision: 1 },
      context,
    );
    await source.harness.runPass(context);
    await bootstrap.ready(source.harness, source.binding, context);
    for (const [throughSequence, expected] of [
      [1, "original passive knowledge"],
      [2, "corrected passive knowledge"],
    ] as const) {
      const knowledge = await exportNativeChannelKnowledge(
        source.source(conversation),
        {
          operationId: `passive:export:${throughSequence}`,
          channelId: source.binding.channelId,
          throughSequence,
        },
        context,
      );
      const receiver = await fixture(`passive:${throughSequence}`);
      const imported = await importNativeChannelKnowledge(
        receiver.harness,
        importInput(knowledge, receiver),
        {},
        context,
      );
      expect(
        (await imported.context(context)).messages
          .filter((message) => message.role === "user")
          .map((message) => message.content),
      ).toEqual([expected]);
      expect(knowledge.anchors).toHaveLength(throughSequence);
      expect((await receiver.harness.inspect(context)).submissions).toEqual([]);
    }
  });

  it("selects actual committed user and assistant frontiers and creates no receiving work", async () => {
    const source = await completedSource();
    const inputKnowledge = await exportNativeChannelKnowledge(
      source.source(source.conversation),
      {
        operationId: "export:input",
        channelId: source.binding.channelId,
        throughSequence: 1,
      },
      context,
    );
    expect(
      inputKnowledge.history.entries
        .flatMap((entry) => entry.model ?? [])
        .filter((message) => message.role === "user"),
    ).toEqual([expect.objectContaining({ content: "original knowledge" })]);
    expect(
      inputKnowledge.history.entries
        .flatMap((entry) => entry.model ?? [])
        .some((message) => message.role === "assistant"),
    ).toBe(false);
    const receiver = await fixture("receiver");
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      importInput(source.knowledge, receiver),
      {},
      context,
    );
    expect((await imported.context(context)).messages).toEqual(
      (await source.conversation.context(context)).messages,
    );
    expect(
      await receiver.harness.snapshot(InboxDoc, imported.id, context),
    ).toEqual({ items: [] });
    expect(
      await receiver.harness.snapshot(LiveDoc, imported.id, context),
    ).toEqual({});
    expect((await receiver.harness.inspect(context)).tasks).toEqual([]);
    expect((await receiver.harness.inspect(context)).submissions).toEqual([]);
    expect(
      (await imported.entries({}, 100, undefined, context)).items.every(
        (entry) => entry.byTaskId === undefined,
      ),
    ).toBe(true);
  });
  it("pins export identity across later model work and rejects a changed operation frontier", async () => {
    const source = await completedSource();
    const reads = source.reads();
    await source.input(source.conversation, "later source work");
    const replay = await exportNativeChannelKnowledge(
      source.source(source.conversation),
      {
        operationId: "export:one",
        channelId: source.binding.channelId,
        throughSequence: source.knowledge.throughSequence,
      },
      context,
    );
    expect(replay).toEqual(source.knowledge);
    expect(source.reads()).toBe(reads);
    expect(Object.isFrozen(replay.history.entries)).toBe(true);
    await expect(
      exportNativeChannelKnowledge(
        source.source(source.conversation),
        {
          operationId: "export:one",
          channelId: source.binding.channelId,
          throughSequence: 99,
        },
        context,
      ),
    ).rejects.toThrow("changed its immutable source frontier");
  });
  it("remaps inherited canonical anchors through a nested fresh-owner fork", async () => {
    const source = await completedSource();
    const receiver = await fixture("nested");
    const unrelated = await receiver.harness.root(context);
    await unrelated.commit(async (tx) => {
      for (let index = 0; index < 10; index++)
        await tx.appendEntry(unrelated.id, { kind: "unrelated" });
    }, context);
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      importInput(source.knowledge, receiver),
      {},
      context,
    );
    receiver.events.push(...source.events);
    const nested = await exportNativeChannelKnowledge(
      receiver.source(imported),
      {
        operationId: "nested:export",
        channelId: receiver.binding.channelId,
        throughSequence: 1,
      },
      context,
    );
    expect(nested.history.source.conversationId).toBe(imported.id);
    expect(nested.anchors[0]!.entryId).not.toBe(
      source.knowledge.anchors[0]!.entryId,
    );
    expect(
      nested.history.entries
        .flatMap((entry) => entry.model ?? [])
        .filter((message) => message.role === "user"),
    ).toEqual([expect.objectContaining({ content: "original knowledge" })]);
    expect(
      nested.history.entries
        .flatMap((entry) => entry.model ?? [])
        .some((message) => message.role === "assistant"),
    ).toBe(false);
    const final = await fixture("final");
    const last = await importNativeChannelKnowledge(
      final.harness,
      importInput(nested, final),
      {},
      context,
    );
    expect(
      (await last.context(context)).messages.filter(
        (message) => message.role === "user",
      ),
    ).toEqual([expect.objectContaining({ content: "original knowledge" })]);
  });
  it("rolls back the native candidate and directory on the original initializer failure", async () => {
    const source = await completedSource();
    const receiver = await fixture("failed");
    const original = new Error("original receiving publication binding failed");
    let candidateId: Conversation["id"] | undefined;
    await expect(
      importNativeChannelKnowledge(
        receiver.harness,
        importInput(source.knowledge, receiver),
        {
          initialize: async (tx, id) => {
            candidateId = id;
            await tx.appendEntry(id, { kind: "candidate-only" });
            throw original;
          },
        },
        context,
      ),
    ).rejects.toBe(original);
    expect(
      await receiver.harness.conversation(candidateId!, context),
    ).toBeUndefined();
    expect(
      await lookupNativeChannelConversation(
        receiver.harness,
        receiver.binding,
        context,
      ),
    ).toBeNull();
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      importInput(source.knowledge, receiver),
      {},
      context,
    );
    expect(
      (await imported.entries({}, 100, undefined, context)).items.some(
        (entry) => entry.kind === "candidate-only",
      ),
    ).toBe(false);
  });
  it("rejects canonical event substitution on inherited anchors", async () => {
    const source = await completedSource();
    const receiver = await fixture("substitution");
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      importInput(source.knowledge, receiver),
      {},
      context,
    );
    receiver.events.push(
      ...source.events.map((event) => ({
        ...event,
        senderId: "substituted-sender",
      })),
    );
    await expect(
      exportNativeChannelKnowledge(
        receiver.source(imported),
        {
          operationId: "substituted:export",
          channelId: receiver.binding.channelId,
          throughSequence: source.knowledge.throughSequence,
        },
        context,
      ),
    ).rejects.toThrow("changed its canonical event");
  });
  it("reopens the exact receiving SQLite identity without repeating import initialization", async () => {
    const source = await completedSource();
    const directory = await mkdtemp(
      join(tmpdir(), "native-channel-knowledge-"),
    );
    directories.push(directory);
    const path = join(directory, "receiver.sqlite");
    let receiver = await fixture("sqlite", await openNodeSqliteStorage(path));
    let initialized = 0;
    const input = importInput(source.knowledge, receiver);
    const imported = await importNativeChannelKnowledge(
      receiver.harness,
      input,
      {
        initialize: async () => {
          initialized++;
        },
      },
      context,
    );
    await receiver.harness.close(context);
    receiver = await fixture("sqlite", await openNodeSqliteStorage(path));
    const replay = await importNativeChannelKnowledge(
      receiver.harness,
      input,
      {
        initialize: async () => {
          initialized++;
        },
      },
      context,
    );
    expect(replay.id).toBe(imported.id);
    expect(initialized).toBe(1);
    expect((await replay.context(context)).messages).toEqual(
      (await source.conversation.context(context)).messages,
    );
    await expect(
      importNativeChannelKnowledge(
        receiver.harness,
        { ...input, parentChannelId: "foreign" },
        {},
        context,
      ),
    ).rejects.toThrow("exact source");
  });
});
