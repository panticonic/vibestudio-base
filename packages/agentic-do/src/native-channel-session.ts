import type { Context, JsonValue } from "@panticonic/pi-chord";
import { formatFeedbackNote } from "./feedback-ingest.js";
import {
  configure,
  defineDoc,
  defineDocFamily,
  UserEntry,
  type AgentChange,
  type Conversation,
  type ConversationId,
  type EntryDraft,
  type EntryId,
  type Harness,
  type SubmissionId,
  type Submission,
  type SubmissionRecord,
  type Tx,
  type TaskId,
  type UserInput,
} from "@panticonic/pi-durable";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  nativeOriginatingInputSchema,
  type NativeOriginatingInput,
} from "@vibestudio/service-schemas/nativeInvocation";
import type { ChannelAgenticContext } from "@workspace/pubsub";
import {
  agenticEventSchema,
  participantKey,
  type AgenticEvent,
  type UiFeedbackPayload,
} from "@workspace/agentic-protocol";
import {
  retainedAgentExecutionOwner,
  retainedAgentExecutionOwnerInTransaction,
} from "./native-agent-session.js";

export interface NativeChannelBinding {
  readonly channelId: string;
  readonly contextId: string;
}

/** The exact host-resolved mailbox envelope, before product response policy. */
export interface NativeChannelDelivery {
  readonly deliveryId: string;
  readonly channelId: string;
  readonly channelRef: {
    readonly source: string;
    readonly className: string;
    readonly objectKey: string;
  };
  readonly participantId: string;
  readonly subscriptionRevision: number;
  readonly eventSequence: number;
  readonly envelope: unknown;
  readonly agenticContext: ChannelAgenticContext;
}

/** Only product policy selects an input. Observations and feedback are passive. */
export type NativeChannelIntake =
  | {
      readonly kind: "input";
      readonly content: UserInput;
      readonly whenBusy?: "steer" | "followUp" | "reject";
    }
  | { readonly kind: "observation"; readonly entry: EntryDraft }
  | { readonly kind: "feedback"; readonly payload: UiFeedbackPayload }
  | { readonly kind: "message-edit"; readonly content: UserInput }
  | { readonly kind: "message-retract" };

export interface NativeChannelAdmission {
  readonly conversationId: ConversationId;
  readonly submissionId: SubmissionId;
  readonly disposition: "processed" | "duplicate";
}

/** Product facts join fresh native input admission; no effects or Session calls here. */
export type NativeChannelInputPrepare = (
  tx: Tx,
  admission: {
    readonly conversationId: ConversationId;
    readonly submissionId: SubmissionId;
    readonly delivery: NativeChannelDelivery;
    readonly binding: NativeChannelBinding;
  },
) => void | Promise<void>;

const ChannelDirectory = defineDocFamily<
  {
    channelId: string;
    contextId: string;
    conversationId: ConversationId | null;
  },
  null
>({
  kind: "vibestudio.channel-conversation",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ channelId: "", contextId: "", conversationId: null }),
  checkpointWhen: () => true,
});

const ConversationChannel = defineDoc<{ channelId: string; contextId: string }>(
  {
    kind: "vibestudio.conversation-channel",
    version: 1,
    scope: "conversation",
    history: "latest",
    fork: "initial",
    initial: () => ({ channelId: "", contextId: "" }),
    checkpointWhen: () => true,
  },
);

/** The actual native task owns opening; absence means direct configured creation. */
export const NativeChannelOpening = defineDoc<{
  taskId: TaskId | null;
  status: "ready" | "opening";
}>({
  kind: "vibestudio.channel-opening",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ taskId: null, status: "ready" }),
  checkpointWhen: () => true,
});

async function requireNativeChannelReady(
  tx: Tx,
  conversationId: ConversationId,
): Promise<void> {
  const opening = await tx.doc(NativeChannelOpening, conversationId);
  if (opening.status !== "ready")
    throw new Error("Native channel initialization has not completed");
}

export const NATIVE_CHANNEL_INPUT_ADMITTED_KIND =
  "vibestudio.channel-input-admitted";

/** A signal of a genuine admitted native input, not a second input or queue. */
export async function recordNativeChannelInputAdmission(
  tx: Tx,
  conversationId: ConversationId,
  submissionId: SubmissionId,
): Promise<EntryId> {
  await requireNativeChannelReady(tx, conversationId);
  const owner = await retainedAgentExecutionOwnerInTransaction(tx);
  const binding = await tx.doc(ConversationChannel, conversationId);
  assertBinding(binding, owner.contextId);
  const directory = await tx.doc(ChannelDirectory, binding.channelId, null);
  if (
    directory.conversationId !== conversationId ||
    directory.contextId !== binding.contextId
  )
    throw new Error("Native input admission has no canonical channel binding");
  const entry = await tx.appendEntry(conversationId, {
    kind: NATIVE_CHANNEL_INPUT_ADMITTED_KIND,
    data: { submissionId },
  });
  return entry.id;
}

/** Resolve a prepared native conversation back to its actual product channel. */
export async function retainedNativeConversationChannel(
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
): Promise<NativeChannelBinding> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  const binding = await harness.snapshot(
    ConversationChannel,
    conversationId,
    context,
  );
  if (!binding)
    throw new Error("Native conversation has no retained channel binding");
  assertBinding(binding, owner.contextId);
  const directory = await harness.snapshot(
    ChannelDirectory,
    binding.channelId,
    context,
  );
  if (
    directory?.conversationId !== conversationId ||
    directory.contextId !== binding.contextId
  )
    throw new Error(
      "Native conversation conflicts with its canonical channel directory",
    );
  if (!(await harness.conversation(conversationId, context)))
    throw new Error("Native channel conversation was not committed");
  return { channelId: binding.channelId, contextId: binding.contextId };
}

const DeliveryAdmission = defineDocFamily<
  {
    identity: string;
    sourceIdentity: string;
    intake: JsonValue | null;
    sourceChannelId: string;
    targetChannelId: string;
    contextId: string;
    conversationId: ConversationId | null;
    submissionId: SubmissionId | null;
    feedbackOccurrenceKeys: string[];
  },
  null
>({
  kind: "vibestudio.channel-input-admission",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({
    identity: "",
    sourceIdentity: "",
    intake: null,
    sourceChannelId: "",
    targetChannelId: "",
    contextId: "",
    conversationId: null,
    submissionId: null,
    feedbackOccurrenceKeys: [],
  }),
  checkpointWhen: () => true,
});

// Source-event identity survives a relationship revision without creating a second input.
const SourceEventAdmission = defineDocFamily<
  { identity: string; deliveryId: string },
  null
>({
  kind: "vibestudio.channel-source-admission",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ identity: "", deliveryId: "" }),
  checkpointWhen: () => true,
});
export type NativeChannelFeedbackFrontier = {
  channelRef: { source: string; className: string; objectKey: string };
  sequence: number;
};
const SourceMessage = defineDocFamily<
  {
    author: string;
    conversationId: ConversationId | null;
    submissionId: SubmissionId | null;
    submissionType: "input" | "write" | null;
    channelId: string;
    participantId: string;
    messageId: string;
    sequence: number;
    originalSequence: number;
    originalEnvelopeId: string;
    contentSequence: number;
    placedContentSequence: number | null;
    feedbackFrontiers: NativeChannelFeedbackFrontier[];
    placedFeedbackFrontiers: NativeChannelFeedbackFrontier[] | null;
    entryId: EntryId | null;
    readProjected: boolean;
    diagnosticPrefix: string;
    retracted: boolean;
  },
  null
>({
  kind: "vibestudio.channel-source-message",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({
    author: "",
    conversationId: null,
    submissionId: null,
    submissionType: null,
    channelId: "",
    participantId: "",
    messageId: "",
    sequence: -1,
    originalSequence: -1,
    originalEnvelopeId: "",
    contentSequence: -1,
    placedContentSequence: null,
    feedbackFrontiers: [],
    placedFeedbackFrontiers: null,
    entryId: null,
    readProjected: false,
    diagnosticPrefix: "",
    retracted: false,
  }),
  checkpointWhen: () => true,
});
const SubmissionSource = defineDocFamily<{ sourceKey: string }, null>({
  kind: "vibestudio.channel-submission-source",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ sourceKey: "" }),
  checkpointWhen: () => true,
});
function logEvent(
  delivery: NativeChannelDelivery,
): Record<string, unknown> | null {
  const envelope = delivery.envelope as {
    kind?: unknown;
    event?: unknown;
  } | null;
  return envelope?.kind === "log" &&
    envelope.event !== null &&
    typeof envelope.event === "object"
    ? (envelope.event as Record<string, unknown>)
    : null;
}
function sourceEvent(
  delivery: NativeChannelDelivery,
): { key: string; identity: string } | null {
  const event = logEvent(delivery);
  if (typeof event?.["messageId"] !== "string") return null;
  return {
    key: canonicalJson([
      delivery.channelRef,
      event["messageId"],
      delivery.participantId,
    ]),
    identity: sha256HexSyncText(
      canonicalJson({
        channelRef: delivery.channelRef,
        participantId: delivery.participantId,
        eventSequence: delivery.eventSequence,
        envelope: delivery.envelope,
        agenticContext: delivery.agenticContext,
      }),
    ),
  };
}
function sourceAgenticEvent(
  delivery: NativeChannelDelivery,
): AgenticEvent | null {
  const event = logEvent(delivery);
  if (event?.["type"] !== "agentic.trajectory.v1/event") return null;
  return agenticEventSchema.parse(event["payload"]) as AgenticEvent;
}
function messageKey(
  delivery: NativeChannelDelivery,
  messageId: string,
): string {
  return canonicalJson([
    delivery.channelRef,
    messageId,
    delivery.participantId,
  ]);
}
async function bindSourceMessage(
  tx: Tx,
  delivery: NativeChannelDelivery,
  conversationId: ConversationId,
  submissionId: SubmissionId,
  submissionType: "input" | "write" = "input",
): Promise<void> {
  const event = sourceAgenticEvent(delivery);
  if (!event || event.kind !== "message.completed") return;
  const messageId = event.causality?.messageId;
  if (!messageId)
    throw new Error("Native input message has no canonical message identity");
  const key = messageKey(delivery, messageId);
  const envelopeId = logEvent(delivery)?.["messageId"];
  if (typeof envelopeId !== "string" || !envelopeId)
    throw new Error(
      "Native input message has no original channel envelope identity",
    );
  const message = await tx.doc(SourceMessage, key, null);
  if (message.submissionId !== null)
    throw new Error("Native source message already owns an input");
  Object.assign(message, {
    author: participantKey(event.actor),
    conversationId,
    submissionId,
    submissionType,
    channelId: delivery.channelId,
    participantId: delivery.participantId,
    messageId,
    sequence: delivery.eventSequence,
    originalSequence: delivery.eventSequence,
    originalEnvelopeId: envelopeId,
    contentSequence: delivery.eventSequence,
  });
  if (submissionType === "input")
    (await tx.doc(SubmissionSource, String(submissionId), null)).sourceKey =
      key;
}
async function reviseSourceMessage(
  tx: Tx,
  delivery: NativeChannelDelivery,
  conversationId: ConversationId,
  intake: Extract<
    NativeChannelIntake,
    { kind: "message-edit" | "message-retract" }
  >,
): Promise<EntryDraft> {
  const event = sourceAgenticEvent(delivery);
  const expected =
    intake.kind === "message-edit" ? "message.edited" : "message.retracted";
  const messageId = event?.causality?.messageId;
  if (!event || event.kind !== expected || !messageId)
    throw new Error("Native message correction has no exact source event");
  const key = messageKey(delivery, messageId);
  const source = await tx.doc(SourceMessage, key, null);
  const payload = event.payload as { by: Parameters<typeof participantKey>[0] };
  const actor = participantKey(event.actor);
  // Unknown messages are passive facts; they cannot acquire a new native input.
  let result: string = "not_found";
  if (source.submissionId !== null) {
    if (source.conversationId !== conversationId)
      throw new Error(
        "Native message correction changed its original conversation",
      );
    if (source.submissionType !== "input") result = "not_input";
    else if (actor !== source.author || participantKey(payload.by) !== actor)
      result = "unauthorized";
    else if (source.retracted) result = "settled";
    else if (delivery.eventSequence < source.sequence) result = "stale";
    else {
      result = await tx.reviseQueuedInput(
        source.submissionId,
        intake.kind === "message-edit"
          ? {
              kind: "replace",
              content: withDiagnostics(intake.content, source.diagnosticPrefix),
            }
          : { kind: "withdraw" },
      );
      if (result === "not_found")
        throw new Error("Native source message lost its canonical submission");
      source.sequence = delivery.eventSequence;
      if (result === "updated")
        source.contentSequence = Math.max(
          source.contentSequence,
          delivery.eventSequence,
        );
      if (result === "withdrawn") source.retracted = true;
    }
  }
  const audit = await tx.appendEntry(conversationId, {
    kind: "vibestudio.channel-message-correction",
    data: {
      sourceKey: key,
      event: event as unknown as JsonValue,
      result,
      ...(intake.kind === "message-edit"
        ? { content: intake.content as JsonValue }
        : {}),
    },
  });
  return {
    kind: "vibestudio.channel-message-correction-admitted",
    data: { correctionEntryId: audit.id },
  };
}
export interface NativeChannelReadReceipt {
  readonly conversationId: ConversationId;
  readonly channelId: string;
  readonly participantId: string;
  readonly messageId: string;
  readonly entryId: EntryId;
  readonly idempotencyKey: string;
}
/** Placement and its channel read obligation commit together, including placement that also settles. */
export async function prepareNativeChannelReadReceipts(
  tx: Tx,
  submissions: readonly SubmissionRecord[],
  enqueue: (receipt: NativeChannelReadReceipt) => Promise<void>,
): Promise<void> {
  for (const submission of submissions) {
    if (submission.type !== "input" || submission.entry === undefined) continue;
    const index = await tx.doc(SubmissionSource, String(submission.id), null);
    if (!index.sourceKey) continue;
    const source = await tx.doc(SourceMessage, index.sourceKey, null);
    if (
      source.submissionId !== submission.id ||
      source.conversationId !== submission.conversationId
    )
      throw new Error(
        "Native read receipt changed its canonical input binding",
      );
    if (source.entryId !== null && source.entryId !== submission.entry)
      throw new Error("Native read receipt changed its placed user entry");
    source.entryId = submission.entry;
    if (
      source.placedContentSequence !== null &&
      source.placedContentSequence !== source.contentSequence
    )
      throw new Error(
        "Native source message changed its placed input revision",
      );
    source.placedContentSequence = source.contentSequence;
    if (
      source.placedFeedbackFrontiers !== null &&
      canonicalJson(source.placedFeedbackFrontiers) !==
        canonicalJson(source.feedbackFrontiers)
    )
      throw new Error(
        "Native source message changed its placed diagnostic provenance",
      );
    source.placedFeedbackFrontiers = source.feedbackFrontiers.map(
      (frontier) => ({
        channelRef: { ...frontier.channelRef },
        sequence: frontier.sequence,
      }),
    );
    if (source.readProjected) continue;
    await enqueue({
      conversationId: submission.conversationId,
      channelId: source.channelId,
      participantId: source.participantId,
      messageId: source.messageId,
      entryId: submission.entry,
      idempotencyKey: `native:read:${index.sourceKey}:${submission.id}`,
    });
    source.readProjected = true;
  }
}
export interface NativeChannelMessageAddress {
  readonly channelRef: NativeChannelDelivery["channelRef"];
  readonly participantId: string;
  readonly messageId: string;
}
/** Exact placed input attribution, read without creating documents, opening work or consulting transcript history. */
export async function retainedNativeChannelOriginatingInput(
  harness: Harness,
  submissionId: SubmissionId,
  context: Context,
): Promise<NativeOriginatingInput | null> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  const index = await harness.snapshot(
    SubmissionSource,
    String(submissionId),
    context,
  );
  // Ordinary initiated inputs and imported/passive knowledge have no mailbox source.
  if (!index?.sourceKey) return null;
  const source = await harness.snapshot(
    SourceMessage,
    index.sourceKey,
    context,
  );
  const submission = await harness.submission(submissionId, context);
  const record = await submission?.status(context);
  if (
    !source ||
    !record ||
    source.submissionType !== "input" ||
    record.type !== "input" ||
    source.submissionId !== submissionId ||
    source.conversationId !== record.conversationId
  )
    throw new Error(
      "Native originating input lost its actual submission binding",
    );
  const conversationId = record.conversationId;
  if (record.entry === undefined) return null;
  if (source.entryId !== record.entry || source.placedContentSequence === null)
    throw new Error(
      "Native originating input has no exact committed placement",
    );
  const conversation = await harness.conversation(conversationId, context);
  if (!conversation)
    throw new Error("Native originating input lost its actual conversation");
  const placed = (
    await conversation.entries(
      { minEntryId: record.entry, maxEntryId: record.entry },
      1,
      undefined,
      context,
    )
  ).items[0];
  if (
    !placed ||
    !UserEntry.is(placed) ||
    placed.id !== record.entry ||
    placed.conversationId !== conversationId
  )
    throw new Error(
      "Native originating input has no genuine placed user entry",
    );
  const sourceAddress: unknown = JSON.parse(index.sourceKey);
  if (!Array.isArray(sourceAddress))
    throw new Error("Native originating input has no canonical source address");
  const address = nativeOriginatingInputSchema.parse({
    conversationId,
    submissionId,
    entryId: record.entry,
    channelRef: sourceAddress[0],
    eventSequence: source.originalSequence,
    envelopeId: source.originalEnvelopeId,
    messageId: source.messageId,
    receiverParticipantId: source.participantId,
  });
  if (
    index.sourceKey !==
      canonicalJson([
        address.channelRef,
        address.messageId,
        address.receiverParticipantId,
      ]) ||
    address.channelRef.objectKey !== source.channelId
  )
    throw new Error(
      "Native originating input changed its original channel address",
    );
  const binding = await retainedNativeConversationChannel(
    harness,
    conversationId,
    context,
  );
  assertBinding(binding, owner.contextId);
  return address;
}
async function canonicalNativeChannelSourceMessageAt(
  harness: Harness,
  address: NativeChannelMessageAddress,
  context: Context,
) {
  const bound = JSON.parse(
    canonicalJson(address),
  ) as NativeChannelMessageAddress;
  if (
    !bound.channelRef.source ||
    !bound.channelRef.className ||
    !bound.channelRef.objectKey ||
    !bound.participantId ||
    !bound.messageId
  )
    throw new Error("Native source message has no exact canonical address");
  const owner = await retainedAgentExecutionOwner(harness, context);
  const source = await harness.snapshot(
    SourceMessage,
    canonicalJson([bound.channelRef, bound.messageId, bound.participantId]),
    context,
  );
  if (!source || source.submissionId === null) return null;
  if (source.submissionType !== "input" && source.submissionType !== "write")
    throw new Error("Native source message lost its actual submission type");
  if (
    source.channelId !== bound.channelRef.objectKey ||
    source.participantId !== bound.participantId ||
    source.messageId !== bound.messageId ||
    source.conversationId === null
  )
    throw new Error(
      "Native source message conflicts with its canonical address",
    );
  const binding = await retainedNativeConversationChannel(
    harness,
    source.conversationId,
    context,
  );
  assertBinding(binding, owner.contextId);
  return source;
}
/** A genuine model input mapping; passive/write admissions cannot claim native input knowledge. */
export async function retainedNativeChannelSourceMessageAt(
  harness: Harness,
  address: NativeChannelMessageAddress,
  context: Context,
) {
  const source = await canonicalNativeChannelSourceMessageAt(
    harness,
    address,
    context,
  );
  return source?.submissionType === "input" ? source : null;
}

/** Observe exact committed admission, including creation, without allocating a source record or polling. */
export async function waitForNativeChannelSourceMessageAt(
  harness: Harness,
  address: NativeChannelMessageAddress,
  context: Context,
) {
  const exact = JSON.parse(
    canonicalJson(address),
  ) as NativeChannelMessageAddress;
  let revision = 0;
  let ended: Error | undefined;
  let wake: (() => void) | undefined;
  const changed = () => {
    revision++;
    wake?.();
  };
  const close = () => {
    ended = new Error("Native source observation session closed");
    changed();
  };
  const abort = () => changed();
  const unsubscribe = harness.subscribeCommits(changed);
  const unsubscribeClose = harness.subscribeClose(close);
  context.abortSignal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      context.abortSignal?.throwIfAborted();
      if (ended) throw ended;
      const before = revision;
      const source = await canonicalNativeChannelSourceMessageAt(
        harness,
        exact,
        context,
      );
      if (source) return source;
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (revision !== before || ended || context.abortSignal?.aborted)
          resolve();
      });
      wake = undefined;
    }
  } finally {
    unsubscribe();
    unsubscribeClose();
    context.abortSignal?.removeEventListener("abort", abort);
    wake = undefined;
  }
}

export async function retainedNativeChannelSourceMessage(
  harness: Harness,
  delivery: NativeChannelDelivery,
  messageId: string,
  context: Context,
) {
  return retainedNativeChannelSourceMessageAt(
    harness,
    {
      channelRef: delivery.channelRef,
      participantId: delivery.participantId,
      messageId,
    },
    context,
  );
}

const ChannelFeedback = defineDoc<{
  pending: {
    occurrenceKey: string;
    note: string;
    frontier: NativeChannelFeedbackFrontier;
  }[];
}>({
  kind: "vibestudio.channel-feedback",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ pending: [] }),
  checkpointWhen: () => true,
});

const FeedbackOccurrences = defineDoc<{
  seen: { occurrenceKey: string; at: number }[];
}>({
  kind: "vibestudio.feedback-occurrences",
  version: 1,
  scope: "session",
  initial: () => ({ seen: [] }),
  checkpointWhen: () => true,
});

// Existing UI diagnostic policy: recurring errors may be represented again;
// this does not expire work, ownership, or unresolved approval prompts.
const FEEDBACK_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PENDING_FEEDBACK = 20;

function assertBinding(
  binding: NativeChannelBinding,
  ownerContextId: string,
): void {
  if (
    !binding.channelId ||
    !binding.contextId ||
    binding.contextId !== ownerContextId
  )
    throw new Error("Native channel does not match its retained host context");
}

/** Bind a genuine native-created channel conversation, including a staged ownerless history import. */
export async function bindNativeChannelConversation(
  tx: Tx,
  conversationId: ConversationId,
  binding: NativeChannelBinding,
): Promise<void> {
  const bound = { ...binding };
  const owner = await retainedAgentExecutionOwnerInTransaction(tx);
  assertBinding(bound, owner.contextId);
  const directory = await tx.doc(ChannelDirectory, bound.channelId, null);
  if (
    directory.conversationId !== null &&
    (directory.conversationId !== conversationId ||
      directory.contextId !== bound.contextId ||
      directory.channelId !== bound.channelId)
  )
    throw new Error(
      "Native channel conflicts with its committed conversation binding",
    );
  // Native conversation-scoped doc access validates the actual staged/committed
  // conversation; table queries after a fork/create would violate the Tx API.
  const reverse = await tx.doc(ConversationChannel, conversationId);
  if (
    reverse.channelId &&
    (reverse.channelId !== bound.channelId ||
      reverse.contextId !== bound.contextId)
  )
    throw new Error("Native conversation already belongs to another channel");
  reverse.channelId = bound.channelId;
  reverse.contextId = bound.contextId;
  directory.channelId = bound.channelId;
  directory.contextId = bound.contextId;
  directory.conversationId = conversationId;
}

/** Create the actual native conversation and its immutable channel directory in one commit. */
/** Reserve the actual ownerless channel conversation without claiming it is configured. */
export async function nativeChannelConversationInTransaction(
  tx: Tx,
  bound: NativeChannelBinding,
): Promise<{ id: ConversationId; created: boolean }> {
  const owner = await retainedAgentExecutionOwnerInTransaction(tx);
  assertBinding(bound, owner.contextId);
  const directory = await tx.doc(ChannelDirectory, bound.channelId, null);
  if (directory.conversationId !== null) {
    if (
      directory.channelId !== bound.channelId ||
      directory.contextId !== bound.contextId
    )
      throw new Error(
        "Native channel conflicts with its committed conversation binding",
      );
    const conversation = await tx.conversation(directory.conversationId);
    if (!conversation || conversation.owner !== undefined)
      throw new Error("Native channel has no committed ownerless conversation");
    return { id: conversation.id, created: false };
  }
  const conversation = await tx.createConversation({
    ownership: { kind: "ownerless" },
  });
  await bindNativeChannelConversation(tx, conversation.id, bound);
  return { id: conversation.id, created: true };
}

export async function openNativeChannelConversation(
  harness: Harness,
  binding: NativeChannelBinding,
  agent: AgentChange,
  context: Context,
  initialize?: (tx: Tx, conversationId: ConversationId) => Promise<void>,
): Promise<Conversation> {
  const bound = { ...binding };
  // Configuration contains executable registry definitions. Pi persists their
  // names itself; detach the selection containers without serializing code.
  const change: AgentChange = { ...agent };
  const id = await harness.commit(async (tx) => {
    const existing = await nativeChannelConversationInTransaction(tx, bound);
    if (!existing.created) return existing.id;
    const conversation = { id: existing.id };
    await configure(tx, conversation.id, change);
    await initialize?.(tx, conversation.id);
    return conversation.id;
  }, context);
  const conversation = await harness.conversation(id, context);
  if (!conversation)
    throw new Error("Native channel conversation was not committed");
  return conversation;
}

async function channelConversationId(
  harness: Harness,
  binding: NativeChannelBinding,
  context: Context,
): Promise<ConversationId> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  assertBinding(binding, owner.contextId);
  const directory = await harness.snapshot(
    ChannelDirectory,
    binding.channelId,
    context,
  );
  if (
    !directory?.conversationId ||
    directory.channelId !== binding.channelId ||
    directory.contextId !== binding.contextId
  )
    throw new Error(
      "Native channel requires its committed conversation binding",
    );
  return directory.conversationId;
}

/** Read only an existing canonical channel conversation; lifecycle lookup never creates work. */
export async function lookupNativeChannelConversation(
  harness: Harness,
  binding: NativeChannelBinding,
  context: Context,
): Promise<Conversation | null> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  assertBinding(binding, owner.contextId);
  const directory = await harness.snapshot(
    ChannelDirectory,
    binding.channelId,
    context,
  );
  if (!directory) return null;
  if (
    directory.channelId !== binding.channelId ||
    directory.contextId !== binding.contextId ||
    directory.conversationId === null
  )
    throw new Error(
      "Native channel conflicts with its committed conversation binding",
    );
  const conversation = await harness.conversation(
    directory.conversationId,
    context,
  );
  if (!conversation)
    throw new Error("Native channel conversation was not committed");
  return conversation;
}

/** Read-only product projection. It does not create an admission or consume feedback. */
export async function retainedNativeChannelDelivery(
  harness: Harness,
  deliveryId: string,
  context: Context,
) {
  return harness.snapshot(DeliveryAdmission, deliveryId, context);
}

function validateDelivery(incoming: NativeChannelDelivery): void {
  if (
    !incoming.deliveryId ||
    !incoming.channelId ||
    incoming.channelRef.objectKey !== incoming.channelId ||
    !incoming.channelRef.source ||
    !incoming.channelRef.className ||
    !incoming.participantId ||
    !Number.isSafeInteger(incoming.subscriptionRevision) ||
    incoming.subscriptionRevision < 0 ||
    !Number.isSafeInteger(incoming.eventSequence) ||
    incoming.eventSequence < 0
  )
    throw new Error(
      "Native channel delivery has an invalid immutable routing identity",
    );
}

/** Replay the first canonical admission before mutable policy or domain hooks run again. */
export async function verifyNativeChannelDeliveryReplay(
  harness: Harness,
  delivery: NativeChannelDelivery,
  context: Context,
): Promise<NativeChannelAdmission | null> {
  const incoming = JSON.parse(canonicalJson(delivery)) as NativeChannelDelivery;
  validateDelivery(incoming);
  const sourceIdentity = sha256HexSyncText(canonicalJson(incoming));
  const admitted = await retainedNativeChannelDelivery(
    harness,
    incoming.deliveryId,
    context,
  );
  if (!admitted) {
    const source = sourceEvent(incoming);
    if (!source) return null;
    const retained = await harness.snapshot(
      SourceEventAdmission,
      source.key,
      context,
    );
    if (!retained) return null;
    if (retained.identity !== source.identity || !retained.deliveryId)
      throw new Error(
        "Native source event conflicts with its immutable admission",
      );
    const original = await retainedNativeChannelDelivery(
      harness,
      retained.deliveryId,
      context,
    );
    if (
      !original ||
      original.conversationId === null ||
      original.submissionId === null
    )
      throw new Error(
        "Native source event lost its original delivery admission",
      );
    if (
      (await channelConversationId(
        harness,
        { channelId: original.targetChannelId, contextId: original.contextId },
        context,
      )) !== original.conversationId
    )
      throw new Error(
        "Native source event changed its original target binding",
      );
    return {
      conversationId: original.conversationId,
      submissionId: original.submissionId,
      disposition: "duplicate",
    };
  }
  if (
    admitted.sourceIdentity !== sourceIdentity ||
    admitted.sourceChannelId !== incoming.channelId ||
    admitted.intake === null ||
    admitted.conversationId === null ||
    admitted.submissionId === null
  )
    throw new Error(
      "Native channel delivery conflicts with its immutable admission",
    );
  const binding = {
    channelId: admitted.targetChannelId,
    contextId: admitted.contextId,
  };
  if (
    admitted.identity !==
      sha256HexSyncText(
        canonicalJson({ binding, delivery: incoming, intake: admitted.intake }),
      ) ||
    (await channelConversationId(harness, binding, context)) !==
      admitted.conversationId
  )
    throw new Error(
      "Native channel delivery conflicts with its immutable admission",
    );
  return {
    conversationId: admitted.conversationId,
    submissionId: admitted.submissionId,
    disposition: "duplicate",
  };
}

/** Native request-ID admission owns both the product identity and feedback consumption. */
export async function submitNativeChannelDelivery(
  harness: Harness,
  binding: NativeChannelBinding,
  delivery: NativeChannelDelivery,
  intake: NativeChannelIntake,
  context: Context,
  prepareInput?: NativeChannelInputPrepare,
): Promise<NativeChannelAdmission> {
  // Detach caller-owned objects before the first await, retaining the exact
  // canonical identity that the payload factory will actually admit.
  const bound = { ...binding };
  const immutable = JSON.parse(canonicalJson({ delivery, intake })) as {
    delivery: NativeChannelDelivery;
    intake: NativeChannelIntake;
  };
  const incoming = immutable.delivery;
  const prepared = immutable.intake;
  validateDelivery(incoming);
  if (prepared.kind === "feedback" && !prepared.payload.occurrenceKey)
    throw new Error(
      "Native feedback requires its immutable occurrence identity",
    );
  const identity = sha256HexSyncText(
    canonicalJson({ binding: bound, ...immutable }),
  );
  const sourceIdentity = sha256HexSyncText(canonicalJson(incoming));
  const conversationId = await channelConversationId(harness, bound, context);
  const conversation = await harness.conversation(conversationId, context);
  if (!conversation)
    throw new Error("Native channel conversation was not committed");
  const before = await retainedNativeChannelDelivery(
    harness,
    incoming.deliveryId,
    context,
  );
  if (
    before &&
    (before.sourceIdentity !== sourceIdentity ||
      before.targetChannelId !== bound.channelId ||
      before.contextId !== bound.contextId)
  )
    throw new Error(
      "Native channel delivery conflicts with its immutable admission",
    );
  if (before) {
    const replay = await verifyNativeChannelDeliveryReplay(
      harness,
      incoming,
      context,
    );
    if (!replay) throw new Error("Native delivery lost its retained admission");
    return replay;
  }
  const sourceReplay = await verifyNativeChannelDeliveryReplay(
    harness,
    incoming,
    context,
  );
  if (sourceReplay) {
    if (sourceReplay.conversationId !== conversationId)
      throw new Error(
        "Native source event changed its original target binding",
      );
    return sourceReplay;
  }
  let fresh = false;
  const admit = async (tx: Tx, submissionId: SubmissionId) => {
    await requireNativeChannelReady(tx, conversationId);
    const owner = await retainedAgentExecutionOwnerInTransaction(tx);
    assertBinding(bound, owner.contextId);
    const directory = await tx.doc(ChannelDirectory, bound.channelId, null);
    if (
      directory.channelId !== bound.channelId ||
      directory.contextId !== bound.contextId ||
      directory.conversationId !== conversationId
    )
      throw new Error(
        "Native delivery changed its committed conversation binding",
      );
    const source = sourceEvent(incoming);
    if (source) {
      const index = await tx.doc(SourceEventAdmission, source.key, null);
      if (index.deliveryId)
        throw new Error("Native source event already belongs to an admission");
      index.identity = source.identity;
      index.deliveryId = incoming.deliveryId;
    }
    const admission = await tx.doc(
      DeliveryAdmission,
      incoming.deliveryId,
      null,
    );
    if (admission.identity)
      throw new Error("Native delivery already belongs to another submission");
    admission.identity = identity;
    admission.sourceIdentity = sourceIdentity;
    admission.intake = prepared as unknown as JsonValue;
    admission.sourceChannelId = incoming.channelId;
    admission.targetChannelId = bound.channelId;
    admission.contextId = bound.contextId;
    admission.conversationId = conversationId;
    admission.submissionId = submissionId;
    fresh = true;
    return admission;
  };
  let submission: Submission;
  try {
    submission =
      prepared.kind === "input"
        ? await conversation.submit(
            {
              type: "input",
              requestId: incoming.deliveryId,
              ...(prepared.whenBusy ? { whenBusy: prepared.whenBusy } : {}),
              content: async (tx, submissionId) => {
                const admission = await admit(tx, submissionId);
                await bindSourceMessage(
                  tx,
                  incoming,
                  conversationId,
                  submissionId,
                );
                await recordNativeChannelInputAdmission(
                  tx,
                  conversationId,
                  submissionId,
                );
                await prepareInput?.(tx, {
                  conversationId,
                  submissionId,
                  delivery: incoming,
                  binding: bound,
                });
                const feedback = await tx.doc(ChannelFeedback, conversationId);
                const consumed = feedback.pending;
                const notes = consumed.map((item) => item.note);
                admission.feedbackOccurrenceKeys = consumed.map(
                  (item) => item.occurrenceKey,
                );
                feedback.pending = [];
                if (!notes.length) return prepared.content;
                const diagnostic = notes.join("\n\n");
                const sourceEvent = sourceAgenticEvent(incoming);
                const messageId = sourceEvent?.causality?.messageId;
                if (sourceEvent?.kind === "message.completed" && messageId) {
                  const source = await tx.doc(
                    SourceMessage,
                    messageKey(incoming, messageId),
                    null,
                  );
                  source.diagnosticPrefix = diagnostic;
                  source.feedbackFrontiers = consumed.map((item) => ({
                    channelRef: { ...item.frontier.channelRef },
                    sequence: item.frontier.sequence,
                  }));
                  for (const frontier of source.feedbackFrontiers)
                    if (
                      canonicalJson(frontier.channelRef) ===
                      canonicalJson(incoming.channelRef)
                    )
                      source.contentSequence = Math.max(
                        source.contentSequence,
                        frontier.sequence,
                      );
                }
                return withDiagnostics(prepared.content, diagnostic);
              },
            },
            context,
          )
        : await conversation.submit(
            {
              type: "write",
              requestId: incoming.deliveryId,
              entry: async (tx, submissionId) => {
                await admit(tx, submissionId);
                if (prepared.kind === "observation") {
                  await bindSourceMessage(
                    tx,
                    incoming,
                    conversationId,
                    submissionId,
                    "write",
                  );
                  return prepared.entry;
                }
                if (
                  prepared.kind === "message-edit" ||
                  prepared.kind === "message-retract"
                )
                  return reviseSourceMessage(
                    tx,
                    incoming,
                    conversationId,
                    prepared,
                  );
                const seen = await tx.doc(FeedbackOccurrences);
                const now = Date.now();
                seen.seen = seen.seen.filter(
                  (item) => item.at >= now - FEEDBACK_DEDUPE_WINDOW_MS,
                );
                if (
                  !seen.seen.some(
                    (item) =>
                      item.occurrenceKey === prepared.payload.occurrenceKey,
                  )
                ) {
                  seen.seen.push({
                    occurrenceKey: prepared.payload.occurrenceKey,
                    at: now,
                  });
                  const feedback = await tx.doc(
                    ChannelFeedback,
                    conversationId,
                  );
                  feedback.pending.push({
                    occurrenceKey: prepared.payload.occurrenceKey,
                    note: formatFeedbackNote(prepared.payload),
                    frontier: {
                      channelRef: { ...incoming.channelRef },
                      sequence: incoming.eventSequence,
                    },
                  });
                  feedback.pending =
                    feedback.pending.slice(-MAX_PENDING_FEEDBACK);
                }
                return {
                  kind: "vibestudio.ui-feedback",
                  data: {
                    deliveryId: incoming.deliveryId,
                    occurrenceKey: prepared.payload.occurrenceKey,
                  },
                };
              },
            },
            context,
          );
  } catch (original) {
    // A racing policy may have selected another native submission type. Only
    // an actually committed, exact source admission establishes successful replay.
    let replay: NativeChannelAdmission | null;
    try {
      replay = await verifyNativeChannelDeliveryReplay(
        harness,
        incoming,
        context,
      );
    } catch (verification) {
      throw new AggregateError(
        [original, verification],
        "Native admission and canonical replay verification failed",
      );
    }
    if (replay?.conversationId === conversationId) return replay;
    throw original;
  }
  // The kernel correctly skips factories on request-ID replay. Verify the
  // retained product identity even then, including racing different envelopes.
  await channelConversationId(harness, bound, context);
  const admitted = await retainedNativeChannelDelivery(
    harness,
    incoming.deliveryId,
    context,
  );
  if (
    !admitted ||
    admitted.sourceIdentity !== sourceIdentity ||
    admitted.targetChannelId !== bound.channelId ||
    admitted.contextId !== bound.contextId ||
    admitted.conversationId !== conversationId ||
    admitted.submissionId !== submission.id
  )
    throw new Error(
      "Native channel delivery conflicts with its immutable admission",
    );
  await verifyNativeChannelDeliveryReplay(harness, incoming, context);
  return {
    conversationId,
    submissionId: submission.id,
    disposition: fresh ? "processed" : "duplicate",
  };
}

function withDiagnostics(content: UserInput, diagnostic: string): UserInput {
  if (!diagnostic) return content;
  return typeof content === "string"
    ? [diagnostic, content].filter(Boolean).join("\n\n")
    : [{ type: "text", text: diagnostic }, ...content];
}
