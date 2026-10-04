import type { Message } from "@panticonic/pi-ai";
import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import {
  defineTask,
  defineDoc,
  type EntryId,
  type Conversation,
  type ConversationId,
  type Harness,
  type RunningTask,
  type TaskRuntime,
  type Tx,
} from "@panticonic/pi-durable";
import type {
  ChannelReplayEnvelope,
  ChannelReplayAfterRequest,
  ServerLogEvent,
} from "@workspace/pubsub";
import {
  agenticEventSchema,
  applyMessageEvent,
  type AgenticEvent,
  type MessageMap,
  type ProjectedMessage,
} from "@workspace/agentic-protocol";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  NativeChannelOpening,
  bindNativeChannelConversation,
  lookupNativeChannelConversation,
  nativeChannelConversationInTransaction,
  type NativeChannelBinding,
} from "./native-channel-session.js";

export interface NativeImportedChannelInitialization {
  readonly operationId: string;
  readonly parentChannelId: string;
  readonly throughSequence: number;
  readonly knowledgeDigest: string;
}
interface OpeningInput {
  binding: NativeChannelBinding;
  intent: JsonValue;
  history:
    | { kind: "channel" }
    | ({ kind: "native-import" } & NativeImportedChannelInitialization);
}
type OpeningCheckpoint =
  | { phase: "join" }
  | {
      phase: "history";
      page: JsonValue | null;
      after: number;
      through: number | null;
    }
  | { phase: "configure" }
  | { phase: "activate" };

const HistoryMessages = defineDoc<{
  messages: JsonValue;
  entries: Record<string, EntryId>;
}>({
  kind: "vibestudio.channel-history-messages",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ messages: {}, entries: {} }),
  checkpointWhen: () => true,
});

/**
 * One native task owns membership admission and context initialization. Native
 * input admission checks its readiness in the same transaction as the input.
 * Join must replay the exact committed relationship horizon on a lost response.
 */
export function createNativeChannelBootstrap(options: {
  readonly join: (
    binding: NativeChannelBinding,
    intent: JsonValue,
    context: Context,
  ) => Promise<ChannelReplayEnvelope | undefined>;
  readonly replayAfter: (
    binding: NativeChannelBinding,
    request: ChannelReplayAfterRequest,
    context: Context,
  ) => Promise<ChannelReplayEnvelope>;
  readonly contextForEvent: (
    binding: NativeChannelBinding,
    event: ServerLogEvent,
    projected?: ProjectedMessage,
  ) => readonly Message[];
  readonly prepareConfiguration: (
    binding: NativeChannelBinding,
    intent: JsonValue,
    context: Context,
    imported: NativeImportedChannelInitialization | null,
  ) => Promise<(tx: Tx, conversationId: ConversationId) => Promise<void>>;
  readonly afterConfiguration?: (
    binding: NativeChannelBinding,
    intent: JsonValue,
    context: Context,
  ) => Promise<void>;
}) {
  async function advance(
    current: RunningTask<OpeningInput, OpeningCheckpoint, null>,
    rt: TaskRuntime<OpeningInput, OpeningCheckpoint, null, object>,
    context: Context,
  ): Promise<OpeningCheckpoint | null> {
    const checkpoint = current.state.checkpoint;
    switch (checkpoint.phase) {
      case "join": {
        let next: OpeningCheckpoint | null = null;
        try {
          const page = await options.join(
            current.input.binding,
            current.input.intent,
            context,
          );
          const retained =
            page === undefined
              ? null
              : (copyJson(page, {
                  omitUndefinedProperties: true,
                }) as JsonValue);
          next =
            current.input.history.kind === "native-import"
              ? { phase: "configure" }
              : {
                  phase: "history",
                  page: retained,
                  after: 0,
                  through: page?.ready.snapshotLastSeq ?? null,
                };
          await rt.commit(
            () => ({ status: "running", checkpoint: next! }),
            context,
          );
        } catch (error) {
          next = null;
          await rt.parkFailure(error, context);
        }
        return next;
      }
      case "history": {
        let nextCheckpoint: OpeningCheckpoint | null = null;
        try {
          const page =
            checkpoint.page as unknown as ChannelReplayEnvelope | null;
          if (page === null) {
            await rt.commit(
              () => ({ status: "running", checkpoint: { phase: "configure" } }),
              context,
            );
            return { phase: "configure" };
          }
          const through = checkpoint.through;
          if (
            page.ready.contextId !== undefined &&
            page.ready.contextId !== current.input.binding.contextId
          )
            throw new Error(
              "Channel bootstrap replay changed its authoritative context",
            );
          let previous = checkpoint.after;
          for (const event of page.logEvents) {
            if (
              !Number.isSafeInteger(event.id) ||
              event.id <= previous ||
              (through !== null && event.id > through)
            )
              throw new Error(
                "Channel bootstrap replay has an invalid canonical frontier",
              );
            previous = event.id;
          }
          if (
            page.ready.hasMoreAfter &&
            (through === null ||
              page.ready.replayToId !== previous ||
              previous <= checkpoint.after)
          )
            throw new Error(
              "Channel bootstrap replay lacks a stable advancing cursor",
            );
          // Fetch the next bounded page before the commit. A rejected commit or
          // activation loss retains the original page, so no prefix is skipped.
          const next = page.ready.hasMoreAfter
            ? await options.replayAfter(
                current.input.binding,
                { after: previous, throughSeq: through! },
                context,
              )
            : null;
          if (next !== null && next.ready.snapshotLastSeq !== through)
            throw new Error(
              "Channel bootstrap replay changed its retained horizon",
            );
          await rt.commit(async (tx) => {
            const history = await tx.doc(
              HistoryMessages,
              current.conversationId,
            );
            for (const event of page.logEvents) {
              let model = options.contextForEvent(current.input.binding, event);
              let messageId: string | undefined;
              let target: EntryId | undefined;
              let changed = false;
              if (event.type === "agentic.trajectory.v1/event") {
                const parsed = agenticEventSchema.parse(event.payload);
                const canonicalMessageId = parsed.causality?.messageId;
                if (parsed.kind.startsWith("message.") && canonicalMessageId) {
                  messageId = canonicalMessageId;
                  const messages = history.messages as unknown as MessageMap;
                  const before = messages[messageId];
                  const projected = applyMessageEvent(
                    messages,
                    parsed as AgenticEvent<
                      Extract<AgenticEvent["kind"], `message.${string}`>
                    >,
                    event.id,
                  );
                  const after = projected[messageId];
                  changed =
                    canonicalJson(before ?? null) !==
                    canonicalJson(after ?? null);
                  history.messages = copyJson(projected, {
                    omitUndefinedProperties: true,
                  }) as JsonValue;
                  target = history.entries[messageId];
                  model =
                    after && after.status === "completed" && !after.retracted
                      ? options.contextForEvent(
                          current.input.binding,
                          event,
                          after,
                        )
                      : [];
                  // Non-content receipts/foreign edits preserve the existing
                  // actual native context; audit still records their source.
                  if (
                    !changed ||
                    (parsed.kind !== "message.completed" &&
                      target === undefined)
                  )
                    model = [];
                }
              }
              const entry = await tx.appendEntry(current.conversationId, {
                kind: "vibestudio.channel-history",
                data: {
                  channelId: current.input.binding.channelId,
                  event: copyJson(event, {
                    omitUndefinedProperties: true,
                  }) as JsonValue,
                },
                ...(target !== undefined && changed
                  ? {
                      edits: [
                        { target, action: "replace" as const, messages: model },
                      ],
                    }
                  : model.length
                    ? { model }
                    : {}),
              });
              if (
                messageId !== undefined &&
                target === undefined &&
                model.length
              )
                history.entries[messageId] = entry.id;
            }
            nextCheckpoint =
              next === null
                ? { phase: "configure" }
                : {
                    phase: "history",
                    page: copyJson(next, {
                      omitUndefinedProperties: true,
                    }) as JsonValue,
                    after: previous,
                    through,
                  };
            return { status: "running", checkpoint: nextCheckpoint };
          }, context);
        } catch (error) {
          nextCheckpoint = null;
          await rt.parkFailure(error, context);
        }
        return nextCheckpoint;
      }
      case "activate": {
        try {
          await options.afterConfiguration?.(
            current.input.binding,
            current.input.intent,
            context,
          );
          await rt.commit(
            () => ({
              status: "terminal",
              outcome: { status: "completed", result: null },
            }),
            context,
          );
        } catch (error) {
          await rt.parkFailure(error, context);
        }
        return null;
      }
      case "configure": {
        try {
          const configure = await options.prepareConfiguration(
            current.input.binding,
            current.input.intent,
            context,
            current.input.history.kind === "native-import"
              ? current.input.history
              : null,
          );
          await rt.commit(async (tx) => {
            const opening = await tx.doc(
              NativeChannelOpening,
              current.conversationId,
            );
            if (opening.taskId !== current.id || opening.status !== "opening")
              throw new Error(
                "Channel bootstrap lost its exact readiness ownership",
              );
            await configure(tx, current.conversationId);
            opening.status = "ready";
            if (options.afterConfiguration)
              return { status: "running", checkpoint: { phase: "activate" } };
            return {
              status: "terminal",
              outcome: { status: "completed", result: null },
            };
          }, context);
        } catch (error) {
          await rt.parkFailure(error, context);
          return null;
        }
        return options.afterConfiguration ? { phase: "activate" } : null;
      }
    }
  }
  const task = defineTask<OpeningInput, OpeningCheckpoint, null>({
    name: "vibestudio.channel-bootstrap",
    version: 1,
    initial: () => ({ phase: "join" }),
    phases: {
      join: async (current, rt, context) => {
        await advance(current, rt, context);
      },
      history: async (current, rt, context) => {
        await advance(current, rt, context);
      },
      configure: async (current, rt, context) => {
        await advance(current, rt, context);
      },
      activate: async (current, rt, context) => {
        await advance(current, rt, context);
      },
    },
    // Withdrawal joins initialization before membership leave. Losing the
    // caller cannot discard a partial context prefix or recreate it later.
    async abort(current, rt, context) {
      let owned = current;
      for (;;) {
        const checkpoint = await advance(owned, rt, context);
        if (checkpoint === null) return;
        owned = { ...owned, state: { ...owned.state, checkpoint } };
      }
    },
  });
  return {
    task,
    /** Recover the original request before consulting mutable membership state. */
    async retainedIntent(
      harness: Harness,
      binding: NativeChannelBinding,
      context: Context,
    ): Promise<JsonValue | null> {
      const conversation = await lookupNativeChannelConversation(
        harness,
        binding,
        context,
      );
      if (!conversation) return null;
      const opening = await harness.snapshot(
        NativeChannelOpening,
        conversation.id,
        context,
      );
      if (opening?.status !== "opening") return null;
      if (opening.taskId === null)
        throw new Error("Channel bootstrap has no native task owner");
      const retained = await harness.getTask(opening.taskId, context);
      if (!retained || retained.kind !== task.definition.name)
        throw new Error("Channel bootstrap lost its retained task");
      const input = retained.input as unknown as OpeningInput;
      if (canonicalJson(input.binding) !== canonicalJson(binding))
        throw new Error("Channel bootstrap changed its retained binding");
      return input.intent;
    },
    /** Called only inside the genuine native import initializer, before commit publication. */
    async bindImported(
      tx: Tx,
      conversationId: ConversationId,
      binding: NativeChannelBinding,
      intent: JsonValue,
      provenance: NativeImportedChannelInitialization,
    ): Promise<void> {
      if (
        !provenance.operationId ||
        !provenance.parentChannelId ||
        !Number.isSafeInteger(provenance.throughSequence) ||
        provenance.throughSequence < 0 ||
        !/^[a-f0-9]{64}$/.test(provenance.knowledgeDigest)
      )
        throw new Error(
          "Imported channel initialization requires its exact native knowledge provenance",
        );
      await bindNativeChannelConversation(tx, conversationId, binding);
      const opening = await tx.doc(NativeChannelOpening, conversationId);
      if (opening.taskId !== null)
        throw new Error(
          "Imported channel initialization already has a native owner",
        );
      const input = copyJson(
        { binding, intent, history: { kind: "native-import", ...provenance } },
        { omitUndefinedProperties: true },
      ) as unknown as OpeningInput;
      const taskId = await tx.createTask(task, input, {
        conversationId,
        ownership: { kind: "conversation" },
        background: true,
      });
      opening.taskId = taskId;
      opening.status = "opening";
    },
    /** Persist the exact intent before any membership side effect. */
    async open(
      harness: Harness,
      binding: NativeChannelBinding,
      intent: JsonValue,
      context: Context,
    ): Promise<Conversation> {
      const input = copyJson(
        { binding, intent, history: { kind: "channel" } },
        { omitUndefinedProperties: true },
      ) as unknown as OpeningInput;
      const id = await harness.commit(async (tx) => {
        const conversation = await nativeChannelConversationInTransaction(
          tx,
          binding,
        );
        const opening = await tx.doc(NativeChannelOpening, conversation.id);
        if (opening.taskId !== null) {
          if (opening.status === "ready") return conversation.id;
          const retained = await tx.task(opening.taskId);
          const original = retained?.input as unknown as
            | OpeningInput
            | undefined;
          if (
            !retained ||
            retained.kind !== task.definition.name ||
            retained.conversationId !== conversation.id ||
            !original ||
            canonicalJson(original.binding) !== canonicalJson(input.binding) ||
            canonicalJson(original.intent) !== canonicalJson(input.intent)
          )
            throw new Error(
              "Channel bootstrap changed its original membership intent",
            );
          return conversation.id;
        }
        // A genuinely imported/configured retained conversation needs no new history.
        if (!conversation.created) return conversation.id;
        const id = await tx.createTask(task, input, {
          conversationId: conversation.id,
          ownership: { kind: "conversation" },
          background: true,
        });
        opening.taskId = id;
        opening.status = "opening";
        return conversation.id;
      }, context);
      return requireConversation(harness, id, context);
    },
    /** Await only the actual retained opening task; no timer or guessed readiness. */
    async ready(
      harness: Harness,
      binding: NativeChannelBinding,
      context: Context,
    ): Promise<Conversation> {
      const conversation = await lookupNativeChannelConversation(
        harness,
        binding,
        context,
      );
      if (!conversation) throw new Error("Channel bootstrap was not admitted");
      let revision = 0;
      let wake: (() => void) | undefined;
      let closed: Error | undefined;
      let failed: unknown;
      let failureReported = false;
      let settled = false;
      const changed = () => {
        revision++;
        wake?.();
      };
      const unsubscribe = harness.subscribeCommits(changed);
      const unsubscribeClose = harness.subscribeClose(() => {
        closed = new Error("Native readiness observation session closed");
        changed();
      });
      const abort = () => changed();
      const controller = new AbortController();
      let taskObservation: Promise<void> | undefined;
      context.abortSignal?.addEventListener("abort", abort, { once: true });
      try {
        for (;;) {
          context.abortSignal?.throwIfAborted();
          if (closed) throw closed;
          const before = revision;
          const opening = await harness.snapshot(
            NativeChannelOpening,
            conversation.id,
            context,
          );
          // Configuration readiness is an actual committed fact. Activation
          // may itself need the cached readiness promise to admit its input.
          if (!opening || opening.status === "ready") return conversation;
          if (opening.taskId === null)
            throw new Error("Channel bootstrap has no native task owner");
          if (!taskObservation) {
            const signal = context.abortSignal
              ? AbortSignal.any([context.abortSignal, controller.signal])
              : controller.signal;
            taskObservation = harness
              .waitForTask(opening.taskId, { ...context, abortSignal: signal })
              .then(
                () => {
                  settled = true;
                  changed();
                },
                (error) => {
                  if (!controller.signal.aborted) {
                    failed = error;
                    failureReported = true;
                  }
                  changed();
                },
              );
          }
          if (failureReported) throw failed;
          if (settled)
            throw new Error(
              "Channel bootstrap settled without committing readiness",
            );
          await new Promise<void>((resolve) => {
            wake = resolve;
            if (revision !== before || closed || context.abortSignal?.aborted)
              resolve();
          });
          wake = undefined;
        }
      } finally {
        // Retire and join only these observers. The bootstrap task keeps its
        // original activation/repair debt and cannot be abandoned by a viewer.
        controller.abort();
        unsubscribe();
        unsubscribeClose();
        context.abortSignal?.removeEventListener("abort", abort);
        wake = undefined;
        await taskObservation;
      }
    },
    /** Drain/join opening before the product withdraws the exact membership. */
    async cancel(
      harness: Harness,
      binding: NativeChannelBinding,
      context: Context,
    ): Promise<void> {
      const conversation = await lookupNativeChannelConversation(
        harness,
        binding,
        context,
      );
      if (!conversation) return;
      const opening = await harness.snapshot(
        NativeChannelOpening,
        conversation.id,
        context,
      );
      if (!opening || opening.taskId === null) return;
      const task = await harness.getTask(opening.taskId, context);
      if (!task || task.state.status === "terminal") return;
      await harness.abortTask(opening.taskId, context);
      await harness.waitForTask(opening.taskId, context);
    },
  };
}
async function requireConversation(
  harness: Harness,
  id: ConversationId,
  context: Context,
): Promise<Conversation> {
  const conversation = await harness.conversation(id, context);
  if (!conversation)
    throw new Error("Channel bootstrap conversation was not committed");
  return conversation;
}
