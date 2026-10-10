import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import {
  defineDoc,
  defineDocFamily,
  type AgentChange,
  type Conversation,
  type ConversationId,
  type EntryId,
  type EntryRecord,
  type Harness,
  type TaskId,
  type Tx,
} from "@panticonic/pi-durable";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  nativeInvocationId,
  nativeInvocationSourceSchema,
} from "@vibestudio/service-schemas/nativeInvocation";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  agenticEventSchema,
  AGENTIC_EVENT_PAYLOAD_KIND,
  participantKey,
} from "@workspace/agentic-protocol";
import type {
  ExportChannelKnowledgeInput,
  ImportChannelKnowledgeInput,
  NativeChannelKnowledge,
  NativeChannelKnowledgeAnchor,
} from "@workspace/agentic-core/native-channel-knowledge";
import type { ChannelEvent } from "@workspace/pubsub";
import type { ChannelClient } from "./channel-client.js";
import {
  retainedAgentExecutionOwner,
  retainedAgentExecutionOwnerInTransaction,
} from "./native-agent-session.js";
import {
  bindNativeChannelConversation,
  retainedNativeConversationChannel,
  retainedNativeChannelSourceMessageAt,
  type NativeChannelBinding,
  type NativeChannelDelivery,
} from "./native-channel-session.js";

const KnowledgeAnchors = defineDoc<{
  anchors: JsonValue;
  configuration: JsonValue;
}>({
  kind: "vibestudio.channel-knowledge-anchors",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ anchors: [], configuration: null }),
  checkpointWhen: () => true,
});
const KnowledgeExport = defineDocFamily<
  { request: JsonValue | null; knowledge: JsonValue | null },
  null
>({
  kind: "vibestudio.channel-knowledge-export",
  version: 1,
  scope: "conversation",
  family: true,
  history: "latest",
  fork: "initial",
  initial: () => ({ request: null, knowledge: null }),
  checkpointWhen: () => true,
});
const KnowledgeImport = defineDocFamily<
  { identity: string; conversationId: ConversationId | null },
  null
>({
  kind: "vibestudio.channel-knowledge-import",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ identity: "", conversationId: null }),
  checkpointWhen: () => true,
});
function detached<T>(value: T): T {
  return copyJson(value, { omitUndefinedProperties: true }) as unknown as T;
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function entryId(value: unknown): EntryId | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? (value as EntryId)
    : null;
}
function immutableKnowledgeEvent(event: ChannelEvent) {
  return {
    messageId: event.messageId,
    type: event.type,
    senderId: event.senderId,
    payload: event.payload,
    ...(event.senderMetadata ? { senderMetadata: event.senderMetadata } : {}),
    ...(event.contentClass === undefined
      ? {}
      : { contentClass: event.contentClass }),
    ...(event.externalKeys === undefined
      ? {}
      : { externalKeys: event.externalKeys }),
  };
}
/** Knowledge is an exact retained prefix; its anchors include the owner-local channel cursor. */
export function nativeChannelKnowledgeEventDigest(event: ChannelEvent): string {
  return sha256HexSyncText(
    canonicalJson({ id: event.id, ...immutableKnowledgeEvent(event) }),
  );
}
export interface NativeChannelKnowledgeSource {
  readonly harness: Harness;
  readonly conversation: Conversation;
  readonly binding: NativeChannelBinding;
  readonly participantId: string;
  readonly channelRef: NativeChannelDelivery["channelRef"];
  readonly channel: Pick<ChannelClient, "replayAfterPages">;
  readonly configuration?: (context: Context) => JsonValue | Promise<JsonValue>;
}
async function visibleEntry(
  conversation: Conversation,
  id: EntryId,
  context: Context,
): Promise<EntryRecord> {
  const page = await conversation.entries(
    { minEntryId: id, maxEntryId: id },
    1,
    undefined,
    context,
  );
  const entry = page.items[0];
  if (!entry || entry.id !== id)
    throw new Error(
      "Channel knowledge anchor is not visible in its native conversation",
    );
  return entry;
}
function validateRequest(request: ExportChannelKnowledgeInput): void {
  if (
    !request.operationId ||
    !request.channelId ||
    !Number.isSafeInteger(request.throughSequence) ||
    request.throughSequence < 0
  )
    throw new Error(
      "Knowledge export requires its exact operation, channel and committed frontier",
    );
}
function exportReplay(
  value: {
    readonly request: JsonValue | null;
    readonly knowledge: JsonValue | null;
  },
  request: ExportChannelKnowledgeInput,
): NativeChannelKnowledge {
  if (
    canonicalJson(value.request) !== canonicalJson(request) ||
    value.knowledge === null
  )
    throw new Error(
      "Knowledge export operation changed its immutable source frontier",
    );
  return frozen(detached(value.knowledge)) as unknown as NativeChannelKnowledge;
}
/** Capture a canonical channel prefix as actual committed native transcript knowledge. */
export async function exportNativeChannelKnowledge(
  source: NativeChannelKnowledgeSource,
  input: ExportChannelKnowledgeInput,
  context: Context,
): Promise<NativeChannelKnowledge> {
  const request = detached(input);
  validateRequest(request);
  const owner = await retainedAgentExecutionOwner(source.harness, context);
  const binding = await retainedNativeConversationChannel(
    source.harness,
    source.conversation.id,
    context,
  );
  if (
    canonicalJson(binding) !== canonicalJson(source.binding) ||
    request.channelId !== binding.channelId ||
    source.channelRef.objectKey !== binding.channelId ||
    source.participantId !== owner.runtimeId
  )
    throw new Error(
      "Knowledge export requires its actual owned channel conversation",
    );
  const existing = await source.harness.snapshot(
    KnowledgeExport,
    source.conversation.id,
    request.operationId,
    context,
  );
  if (existing) return exportReplay(existing, request);
  const inherited = ((
    await source.harness.snapshot(
      KnowledgeAnchors,
      source.conversation.id,
      context,
    )
  )?.anchors ?? []) as unknown as NativeChannelKnowledgeAnchor[];
  const inheritedById = new Map(
    inherited.map((anchor) => [anchor.envelopeId, anchor]),
  );
  // The finite membership bootstrap writes genuine passive model/context-edit
  // entries. They carry canonical source knowledge, not submitted input authority.
  const passive = new Map<
    string,
    {
      envelopeId: string;
      sequence: number;
      eventDigest: string;
      entryId: EntryId;
    }
  >();
  let cursor: Parameters<Conversation["entries"]>[2];
  for (;;) {
    const entries = await source.conversation.entries({}, 100, cursor, context);
    for (const entry of entries.items) {
      if (
        entry.kind !== "vibestudio.channel-history" ||
        (entry.model === undefined &&
          entry.edits === undefined &&
          entry.head === undefined) ||
        !object(entry.data) ||
        entry.data["channelId"] !== binding.channelId ||
        !object(entry.data["event"])
      )
        continue;
      const event = entry.data["event"] as unknown as ChannelEvent;
      if (
        typeof event.messageId !== "string" ||
        !Number.isSafeInteger(event.id) ||
        event.id < 0
      )
        throw new Error(
          "Native passive knowledge has no exact canonical source event",
        );
      if (passive.has(event.messageId))
        throw new Error(
          "Native passive knowledge has duplicate canonical source entries",
        );
      passive.set(event.messageId, {
        envelopeId: event.messageId,
        sequence: event.id,
        eventDigest: nativeChannelKnowledgeEventDigest(event),
        entryId: entry.id,
      });
    }
    if (entries.next === undefined) break;
    cursor = entries.next;
  }
  const starts = new Map<
    string,
    ReturnType<typeof nativeInvocationSourceSchema.parse>
  >();
  const anchors: NativeChannelKnowledgeAnchor[] = [];
  let at: EntryId | null = null;
  for await (const page of source.channel.replayAfterPages({
    after: 0,
    throughSeq: request.throughSequence,
  })) {
    for (const envelope of page.logEvents) {
      if (envelope.id > request.throughSequence)
        throw new Error(
          "Knowledge replay exceeded its selected canonical frontier",
        );
      const digest = nativeChannelKnowledgeEventDigest(envelope);
      const inheritedAnchor = inheritedById.get(envelope.messageId);
      if (inheritedAnchor) {
        if (inheritedAnchor.eventDigest !== digest)
          throw new Error(
            "Inherited knowledge anchor changed its canonical event",
          );
        if (inheritedAnchor.sequence <= request.throughSequence) {
          await visibleEntry(
            source.conversation,
            inheritedAnchor.entryId,
            context,
          );
          anchors.push(detached(inheritedAnchor));
          at =
            at === null
              ? inheritedAnchor.entryId
              : (Math.max(at, inheritedAnchor.entryId) as EntryId);
        }
        continue;
      }
      const passiveAnchor = passive.get(envelope.messageId);
      if (passiveAnchor) {
        if (
          passiveAnchor.sequence !== envelope.id ||
          passiveAnchor.eventDigest !== digest
        )
          throw new Error(
            "Native passive knowledge changed its canonical source event",
          );
        anchors.push(
          detached({
            envelopeId: passiveAnchor.envelopeId,
            sequence: envelope.id,
            eventDigest: digest,
            entryId: passiveAnchor.entryId,
          }),
        );
        at =
          at === null
            ? passiveAnchor.entryId
            : (Math.max(at, passiveAnchor.entryId) as EntryId);
        continue;
      }
      if (envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND) continue;
      const event = agenticEventSchema.parse(envelope.payload);
      let selected: EntryId | null = null;
      let sequence = envelope.id;
      if (event.kind === "message.completed") {
        const placed = event.causality?.messageId
          ? await retainedNativeChannelSourceMessageAt(
              source.harness,
              {
                channelRef: source.channelRef,
                participantId: source.participantId,
                messageId: event.causality.messageId,
              },
              context,
            )
          : null;
        if (
          placed?.conversationId === source.conversation.id &&
          placed.entryId !== null &&
          placed.placedContentSequence !== null &&
          placed.placedFeedbackFrontiers !== null &&
          placed.placedFeedbackFrontiers.every(
            (frontier) =>
              canonicalJson(frontier.channelRef) ===
                canonicalJson(source.channelRef) &&
              frontier.sequence !== null &&
              frontier.sequence <= request.throughSequence,
          )
        ) {
          sequence = placed.placedContentSequence;
          if (sequence <= request.throughSequence) selected = placed.entryId;
        }
        if (
          envelope.senderId === source.participantId &&
          participantKey(event.actor) === source.participantId
        ) {
          const metadata = event.payload.metadata;
          if (object(metadata) && metadata["nativeEntryId"] !== undefined) {
            const id = entryId(metadata["nativeEntryId"]);
            if (
              id === null ||
              metadata["nativeConversationId"] !== source.conversation.id
            )
              throw new Error(
                "Native assistant knowledge has a foreign entry coordinate",
              );
            const entry = await visibleEntry(source.conversation, id, context);
            const task =
              entry.byTaskId === undefined
                ? undefined
                : await source.harness.getTask(entry.byTaskId, context);
            if (
              entry.byTaskId !== metadata["nativeTaskId"] ||
              !task ||
              task.conversationId !== source.conversation.id ||
              !entry.model?.some((message) => message.role === "assistant")
            )
              throw new Error(
                "Native assistant knowledge lost its actual task and model entry",
              );
            selected = id;
          }
        }
      } else if (
        event.kind === "invocation.started" &&
        envelope.senderId === source.participantId &&
        participantKey(event.actor) === source.participantId
      ) {
        if (
          "nativeSource" in event.payload &&
          event.payload.nativeSource !== undefined
        ) {
          const invocation = nativeInvocationSourceSchema.parse(
            event.payload.nativeSource,
          );
          if (
            invocation.owner.runtimeId !== owner.runtimeId ||
            invocation.owner.contextId !== owner.contextId ||
            invocation.owner.channelId !== binding.channelId ||
            invocation.task.conversationId !== source.conversation.id ||
            nativeInvocationId(invocation) !== event.causality?.invocationId
          )
            throw new Error(
              "Knowledge invocation changed its actual native source",
            );
          starts.set(nativeInvocationId(invocation), invocation);
        }
      } else if (
        (event.kind === "invocation.completed" ||
          event.kind === "invocation.failed" ||
          event.kind === "invocation.cancelled" ||
          event.kind === "invocation.abandoned") &&
        event.causality?.invocationId &&
        starts.has(event.causality.invocationId)
      ) {
        const invocation = starts.get(event.causality.invocationId)!;
        const task = await source.harness.getTask(
          invocation.task.taskId as TaskId<JsonValue>,
          context,
        );
        if (
          !task ||
          task.kind !== invocation.task.kind ||
          task.version !== invocation.task.version ||
          task.conversationId !== source.conversation.id ||
          (task.state.status !== "terminal" &&
            task.state.status !== "completing")
        )
          throw new Error(
            "Knowledge terminal has no actual settled native task",
          );
        const outcome = task.state.outcome;
        const result = "result" in outcome ? outcome.result : undefined;
        const id = object(result) ? entryId(result["entryId"]) : null;
        if (id !== null) {
          const entry = await visibleEntry(source.conversation, id, context);
          if (entry.byTaskId !== task.id)
            throw new Error(
              "Knowledge terminal changed its actual native result entry",
            );
          if (
            entry.model !== undefined ||
            entry.head !== undefined ||
            entry.edits !== undefined
          )
            selected = id;
        }
      }
      if (selected !== null) {
        await visibleEntry(source.conversation, selected, context);
        anchors.push({
          envelopeId: envelope.messageId,
          sequence,
          eventDigest: digest,
          entryId: selected,
        });
        at = at === null ? selected : (Math.max(at, selected) as EntryId);
      }
    }
  }
  const history = await source.conversation.exportHistory(at, context);
  const entryIds = new Set(history.entries.map((entry) => entry.id));
  const candidate: NativeChannelKnowledge = frozen(
    detached({
      channelId: binding.channelId,
      throughSequence: request.throughSequence,
      history,
      anchors: anchors.filter((anchor) => entryIds.has(anchor.entryId)),
    }),
  );
  return source.conversation.commit(async (tx) => {
    await retainedAgentExecutionOwnerInTransaction(tx);
    const receipt = await tx.doc(
      KnowledgeExport,
      source.conversation.id,
      request.operationId,
      null,
    );
    if (receipt.request !== null) return exportReplay(receipt, request);
    const configured = source.configuration
      ? frozen(
          detached({
            ...candidate,
            configuration: await source.configuration(context),
          }),
        )
      : candidate;
    receipt.request = detached(request) as unknown as JsonValue;
    receipt.knowledge = detached(configured) as unknown as JsonValue;
    return configured;
  }, context);
}
class ConcurrentKnowledgeImport extends Error {}
/** Import standalone knowledge with new native IDs, ownership and immutable canonical provenance. */
export async function importNativeChannelKnowledge(
  harness: Harness,
  input: ImportChannelKnowledgeInput,
  options: {
    readonly agent?: AgentChange;
    readonly initialize?: (
      tx: Tx,
      conversationId: ConversationId,
    ) => void | Promise<void>;
  },
  context: Context,
): Promise<Conversation> {
  const request = detached(input);
  if (
    !request.operationId ||
    !request.channelId ||
    !request.contextId ||
    !request.parentChannelId ||
    request.parentChannelId !== request.knowledge.channelId
  )
    throw new Error(
      "Knowledge import requires its exact source and receiving channel identities",
    );
  if (
    !Number.isSafeInteger(request.knowledge.throughSequence) ||
    request.knowledge.throughSequence < 0
  )
    throw new Error("Knowledge import has no exact committed source frontier");
  const ids = new Set(
    request.knowledge.history.entries.map((entry) => entry.id),
  );
  const envelopeIds = new Set<string>();
  for (const anchor of request.knowledge.anchors) {
    if (
      !anchor.envelopeId ||
      envelopeIds.has(anchor.envelopeId) ||
      !Number.isSafeInteger(anchor.sequence) ||
      anchor.sequence < 0 ||
      anchor.sequence > request.knowledge.throughSequence ||
      !/^[a-f0-9]{64}$/.test(anchor.eventDigest) ||
      !ids.has(anchor.entryId)
    )
      throw new Error("Knowledge import has an invalid canonical entry anchor");
    envelopeIds.add(anchor.envelopeId);
  }
  const owner = await retainedAgentExecutionOwner(harness, context);
  if (owner.contextId !== request.contextId)
    throw new Error(
      "Knowledge import does not belong to its receiving host context",
    );
  const identity = sha256HexSyncText(canonicalJson(request));
  async function replay(): Promise<Conversation | null> {
    const receipt = await harness.snapshot(
      KnowledgeImport,
      request.operationId,
      context,
    );
    if (!receipt) return null;
    if (receipt.identity !== identity || receipt.conversationId === null)
      throw new Error("Knowledge import operation changed its immutable input");
    const binding = await retainedNativeConversationChannel(
      harness,
      receipt.conversationId,
      context,
    );
    if (
      binding.channelId !== request.channelId ||
      binding.contextId !== request.contextId
    )
      throw new Error("Knowledge import lost its actual receiving binding");
    const conversation = await harness.conversation(
      receipt.conversationId,
      context,
    );
    if (!conversation)
      throw new Error(
        "Knowledge import lost its committed receiving conversation",
      );
    return conversation;
  }
  const existing = await replay();
  if (existing) return existing;
  try {
    return await harness.importHistory(
      request.knowledge.history,
      {
        ownership: { kind: "ownerless" },
        ...(options.agent === undefined ? {} : { agent: options.agent }),
        init: async (tx, conversationId, entryIds) => {
          const receipt = await tx.doc(
            KnowledgeImport,
            request.operationId,
            null,
          );
          if (receipt.identity) {
            if (receipt.identity !== identity)
              throw new Error(
                "Knowledge import operation changed its immutable input",
              );
            throw new ConcurrentKnowledgeImport();
          }
          await bindNativeChannelConversation(tx, conversationId, {
            channelId: request.channelId,
            channelRef: request.channelRef,
            contextId: request.contextId,
          });
          const anchors = request.knowledge.anchors.map((anchor) => {
            const entry = entryIds[anchor.entryId];
            if (entry === undefined)
              throw new Error(
                "Native history import lost an exact receiving entry allocation",
              );
            return { ...anchor, entryId: entry };
          });
          const retained = await tx.doc(KnowledgeAnchors, conversationId);
          retained.anchors = detached(anchors) as unknown as JsonValue;
          retained.configuration = request.knowledge.configuration ?? null;
          await options.initialize?.(tx, conversationId);
          receipt.identity = identity;
          receipt.conversationId = conversationId;
        },
      },
      context,
    );
  } catch (error) {
    if (!(error instanceof ConcurrentKnowledgeImport)) throw error;
    const committed = await replay();
    if (!committed)
      throw new Error(
        "Concurrent knowledge import has no committed receiving identity",
        { cause: error },
      );
    return committed;
  }
}

/** The original imported product configuration, committed with the genuine receiving history. */
export async function retainedNativeChannelKnowledgeConfiguration(
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
): Promise<JsonValue> {
  await retainedNativeConversationChannel(harness, conversationId, context);
  return detached(
    (await harness.snapshot(KnowledgeAnchors, conversationId, context))
      ?.configuration ?? null,
  );
}
