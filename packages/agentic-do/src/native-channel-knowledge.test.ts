import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  type Harness,
  type Storage,
  type Conversation,
} from "@panticonic/pi-durable";
import { openNodeCompositeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { DatabaseSync } from "node:sqlite";
import { copyFile } from "node:fs/promises";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import type { ServerLogEvent as ChannelEvent } from "@workspace/pubsub";
import { openBoundAgentSession } from "./native-agent-session.js";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  openNativeChannelConversation,
  submitNativeChannelDelivery,
  type NativeChannelDelivery,
} from "./native-channel-session.js";
import {
  adoptNativeChannelKnowledge,
  nativeForkFrontier,
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
async function fixture(
  name: string,
  storage: Storage = new MemoryStorage(),
  adoptFork = false,
) {
  const owner = {
    runtimeId: `do:workers/agent:Agent:${name}`,
    contextId: `context:${name}`,
    incarnation: `storage:${name}`,
    authoritySessionId: `authority:${name}`,
  };
  const binding = {
    channelId: `channel:${name}`,
    contextId: owner.contextId,
    channelRef: {
      source: "workers/channel",
      className: "ChannelDO",
      objectKey: `channel:${name}`,
    },
  };
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
    { ...owner, generation: 1 },
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
    { adoptFork },
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

function frontierOf(
  f: Awaited<ReturnType<typeof fixture>>,
  conversation: Conversation,
  throughSequence: number,
  commitFor: Parameters<typeof nativeForkFrontier>[2] = (at) => ({
    commit: "c0ffee",
    entryHigh: at ?? 0,
  }),
) {
  return nativeForkFrontier(
    f.source(conversation),
    {
      operationId: `frontier:${throughSequence}`,
      channelId: f.binding.channelId,
      throughSequence,
    },
    commitFor,
    context,
  );
}
describe("native channel fork frontier and adoption", () => {
  it("names the conversation, the entry the channel prefix accounts for, and the anchors of that prefix", async () => {
    const f = await fixture("frontier-source");
    const conversation = await f.open();
    await f.input(conversation, "first question");
    const afterFirst = Math.max(...f.events.map((event) => event.id));
    await f.input(conversation, "second question");
    const afterSecond = Math.max(...f.events.map((event) => event.id));
    const asked: Array<number | null> = [];
    const first = await frontierOf(f, conversation, afterFirst, (at) => {
      asked.push(at);
      return { commit: "turn-one", entryHigh: at ?? 0 };
    });
    const second = await frontierOf(f, conversation, afterSecond);
    expect(first.conversationId).toBe(conversation.id);
    expect(first.channelId).toBe(f.binding.channelId);
    expect(first.throughSequence).toBe(afterFirst);
    expect(first.commit).toBe("turn-one");
    // The commit is asked for with the greatest entry that prefix accounts for.
    expect(asked).toEqual([first.entryHigh]);
    expect(first.anchors.length).toBeGreaterThan(0);
    for (const anchor of first.anchors) {
      expect(anchor.sequence).toBeLessThanOrEqual(afterFirst);
      expect(anchor.entryId).toBeLessThanOrEqual(first.entryHigh);
      expect(anchor.eventDigest).toMatch(/^[a-f0-9]{64}$/);
    }
    // A longer prefix accounts for more of the conversation, with the same anchors for the part they share.
    expect(second.entryHigh).toBeGreaterThan(first.entryHigh);
    expect(second.anchors.length).toBeGreaterThan(first.anchors.length);
    for (const anchor of first.anchors)
      expect(second.anchors).toContainEqual(anchor);
  });
  it("drops the anchors of a turn that the commit it forks at does not hold", async () => {
    const f = await fixture("frontier-limited");
    const conversation = await f.open();
    await f.input(conversation, "kept turn");
    await f.input(conversation, "later turn");
    const head = Math.max(...f.events.map((event) => event.id));
    const whole = await frontierOf(f, conversation, head);
    const kept = whole.anchors
      .map((anchor) => anchor.entryId)
      .sort((x, y) => x - y)[0]!;
    const limited = await frontierOf(f, conversation, head, () => ({
      commit: "earlier-turn",
      entryHigh: kept,
    }));
    expect(limited.entryHigh).toBe(kept);
    expect(limited.anchors.length).toBeLessThan(whole.anchors.length);
    for (const anchor of limited.anchors)
      expect(anchor.entryId).toBeLessThanOrEqual(kept);
  });
  it("binds a forked cell's own conversation to the channel it was forked for, once, and refuses a different frontier for the same operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-fork-adoption-"));
    directories.push(directory);
    const parentPath = join(directory, "parent.sqlite");
    const parent = await fixture(
      "fork-parent",
      await openNodeCompositeSqliteStorage(parentPath),
    );
    const conversation = await parent.open();
    await parent.input(conversation, "knowledge before the fork");
    const head = Math.max(...parent.events.map((event) => event.id));
    const frontier = await frontierOf(parent, conversation, head);
    await parent.harness.close(context);
    sessions.splice(sessions.indexOf(parent.harness), 1);
    // A fork of the cell: the versioned conversation comes with it, the local set (owner, tasks, bindings) starts empty.
    const forkPath = join(directory, "fork.sqlite");
    await copyFile(parentPath, forkPath);
    const raw = new DatabaseSync(forkPath);
    for (const table of [
      "tasks",
      "submissions",
      "documents",
      "document_revisions",
      "payload_chunks",
      "record_ids",
    ])
      raw.exec(`DELETE FROM vsl_${table}`);
    raw.exec("UPDATE vsl_durable_metadata SET next_id = '2', next_seq = 1");
    raw.close();
    const fork = await fixture(
      "fork-child",
      await openNodeCompositeSqliteStorage(forkPath),
      true,
    );
    const adopted = await adoptNativeChannelKnowledge(
      fork.harness,
      {
        operationId: "fork:adopt",
        parentChannelId: frontier.channelId,
        channelId: fork.binding.channelId,
        channelRef: fork.binding.channelRef,
        contextId: fork.binding.contextId,
        frontier,
      },
      {},
      context,
    );
    expect(adopted.id).toBe(frontier.conversationId);
    // The entries the fork holds are the parent's, under the same IDs.
    const entries = await adopted.entries({}, 100, undefined, context);
    expect(entries.items.length).toBeGreaterThan(0);
    expect(Math.max(...entries.items.map((entry) => entry.id))).toBeGreaterThanOrEqual(
      frontier.entryHigh,
    );
    expect(
      await retainedNativeChannelKnowledgeConfiguration(
        fork.harness,
        adopted.id,
        context,
      ),
    ).toBeNull();
    // The same adoption again finds its receipt; a different frontier under its name is refused.
    const again = await adoptNativeChannelKnowledge(
      fork.harness,
      {
        operationId: "fork:adopt",
        parentChannelId: frontier.channelId,
        channelId: fork.binding.channelId,
        channelRef: fork.binding.channelRef,
        contextId: fork.binding.contextId,
        frontier,
      },
      {},
      context,
    );
    expect(again.id).toBe(adopted.id);
    await expect(
      adoptNativeChannelKnowledge(
        fork.harness,
        {
          operationId: "fork:adopt",
          parentChannelId: frontier.channelId,
          channelId: fork.binding.channelId,
          channelRef: fork.binding.channelRef,
          contextId: fork.binding.contextId,
          frontier: { ...frontier, throughSequence: frontier.throughSequence + 1 },
        },
        {},
        context,
      ),
    ).rejects.toThrow(/changed its immutable input/);
  });
  it("refuses a cell with a conversation and no owner unless it is a fork being adopted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-unbound-"));
    directories.push(directory);
    const path = join(directory, "cell.sqlite");
    const first = await fixture(
      "unbound",
      await openNodeCompositeSqliteStorage(path),
    );
    await first.open();
    await first.harness.close(context);
    sessions.splice(sessions.indexOf(first.harness), 1);
    const raw = new DatabaseSync(path);
    for (const table of ["documents", "document_revisions", "payload_chunks", "record_ids", "tasks", "submissions"])
      raw.exec(`DELETE FROM vsl_${table}`);
    raw.close();
    await expect(
      fixture("unbound-second", await openNodeCompositeSqliteStorage(path)),
    ).rejects.toThrow(/Unbound execution namespace/);
  });
});
