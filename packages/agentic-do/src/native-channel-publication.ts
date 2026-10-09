import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import type { AssistantMessage } from "@panticonic/pi-ai";
import {
  AssistantEntry,
  DirectToolResultEntry,
  ToolResultEntry,
  LiveDoc,
  defineDoc,
  defineDocFamily,
  defineTask,
  type ConversationId,
  type EntryRecord,
  type EntryId,
  type Harness,
  type HarnessOptions,
  type RunningTask,
  type TaskId,
  type TaskRuntime,
  type SubmissionId,
  type Tx,
  type ToolExecutionResult,
} from "@panticonic/pi-durable";
import { classifyModelFailure } from "@workspace/agentic-core/model-failures";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  AGENTIC_PROTOCOL_VERSION,
  agenticEventSchema,
  eventKindSchemas,
  agentToolFailureFromUnknown,
  invocationAbandonedPayload,
  invocationCancelledPayload,
  invocationCompletedPayload,
  invocationFailedPayload,
  type ActorRef,
  type AgenticEvent,
  type MessageBlockInput,
  type TurnId,
} from "@workspace/agentic-protocol";
import {
  prepareNativeInvocationTerminals,
  type NativeInvocationTerminalPublication,
} from "./native-invocation-boundary.js";

export interface NativeChannelProjection {
  readonly channelId: string;
  readonly participantId: string;
  readonly actor: ActorRef;
  readonly policy: "all" | "turn-final" | "notify-only";
  /** Exact retained supervisor audience for a child's normal final report. */
  readonly reportTo?: string;
}
import { prepareNativeChannelReadReceipts } from "./native-channel-session.js";
import {
  nativeRunWaitPresentation,
  type NativeWaitNotice,
} from "./native-wait-presentation.js";
import { nativeAutomationPresentation } from "./native-automation-runs.js";

interface PublicationInput {
  channelId: string;
  participantId: string;
  previousTask: TaskId | null;
  events: { event: JsonValue; key: string }[];
  terminal: JsonValue | null;
  terminalCreatedAt: string | null;
}
interface PublicationCheckpoint {
  phase: "publish";
  index: number;
  events: { event: JsonValue; key: string }[] | null;
}
const Projection = defineDoc<{ binding: JsonValue; tail: TaskId | null }>({
  kind: "vibestudio.native-channel-projection",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ binding: null, tail: null }),
  checkpointWhen: () => true,
});
// Publication cursor only. pi.live.run remains the sole owner of execution.
// The first admitted input identifies a run across generation/tool handoffs.
const RunPublication = defineDoc<{
  input: SubmissionId | null;
  wait: NativeWaitNotice | null;
  revision: number;
}>({
  kind: "vibestudio.native-run-publication",
  version: 2,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ input: null, wait: null, revision: 0 }),
  migrate: (value, fromVersion) => {
    if (fromVersion !== 1)
      throw new Error("Unsupported native run publication version");
    return {
      input: value["input"] as SubmissionId | null,
      wait: null,
      revision: 0,
    };
  },
  checkpointWhen: () => true,
});
const AutomationPublication = defineDocFamily<
  { opened: boolean; closed: boolean },
  null
>({
  kind: "vibestudio.native-automation-publication",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: () => ({ opened: false, closed: false }),
  checkpointWhen: () => true,
});
function nativeTurnId(
  conversationId: ConversationId,
  input: SubmissionId,
): TurnId {
  return `native-run:${conversationId}:${input}` as TurnId;
}
// An immutable index of existing publication debt, not another delivery queue.
const AnswerPublication = defineDocFamily<
  {
    policy: NativeChannelProjection["policy"];
    channelId: string;
    participantId: string;
    tasks: { taskId: TaskId; index: number; messageId: string }[];
  },
  null
>({
  kind: "vibestudio.native-answer-publication",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: () => ({
    policy: "all",
    channelId: "",
    participantId: "",
    tasks: [],
  }),
  checkpointWhen: () => true,
});

export interface NativePublishedAnswer {
  readonly conversationId: number;
  readonly entryId: number;
  readonly taskId: number | null;
  readonly publicationTaskIds: readonly number[];
  readonly messages: readonly {
    messageId: string;
    outcome: "completed" | "interrupted" | "tool_calls_only" | "empty";
    text: string;
    published: boolean;
  }[];
}

/** Join this exact committed answer's canonical channel acceptance. Cancelling ends only the observation. */
export async function waitForNativeAnswerPublication(
  harness: Harness,
  conversationId: ConversationId,
  entryId: EntryId,
  context: Context,
): Promise<NativePublishedAnswer> {
  const conversation = await harness.conversation(conversationId, context);
  if (!conversation)
    throw new Error("Native answer conversation does not exist");
  const entry = (
    await conversation.entries(
      { minEntryId: entryId, maxEntryId: entryId },
      1,
      undefined,
      context,
    )
  ).items[0];
  if (
    !entry ||
    entry.id !== entryId ||
    entry.conversationId !== conversationId ||
    entry.kind !== AssistantEntry.kind
  )
    throw new Error(
      "Native answer is not an original assistant entry of this conversation",
    );
  const debt = await harness.snapshot(
    AnswerPublication,
    conversationId,
    String(entryId),
    context,
  );
  const binding = projection(
    (await harness.snapshot(Projection, conversationId, context))?.binding ??
      null,
  );
  if (
    !debt ||
    !binding ||
    debt.channelId !== binding.channelId ||
    debt.participantId !== binding.participantId ||
    debt.policy !== binding.policy
  )
    throw new Error("Native answer lost its original publication binding");
  const messages: NativePublishedAnswer["messages"][number][] = [];
  for (const [index, message] of (entry.model ?? []).entries()) {
    if (message.role !== "assistant") continue;
    const messageId = `native:${conversationId}:${entryId}:${index}`;
    const owed =
      !suppressed(binding) &&
      !(binding.policy === "turn-final" && message.stopReason === "toolUse");
    const pointer = debt.tasks.find(
      (item) => item.index === index && item.messageId === messageId,
    );
    if (owed !== !!pointer)
      throw new Error(
        "Native answer publication debt does not match its captured policy",
      );
    if (pointer) {
      const task = await harness.getTask(pointer.taskId, context);
      const expectedKey = `${messageId}:completed`;
      const input = task?.input as PublicationInput | undefined;
      if (
        !task ||
        task.kind !== "vibestudio.channel-publication" ||
        task.version !== 1 ||
        task.conversationId !== conversationId ||
        !input ||
        input.channelId !== debt.channelId ||
        input.participantId !== debt.participantId ||
        input.events.length !== 1 ||
        input.events[0]?.key !== expectedKey ||
        input.terminal !== null
      )
        throw new Error(
          "Native answer publication lost its exact canonical task",
        );
      const event = agenticEventSchema.parse(input.events[0].event);
      if (
        event.kind !== "message.completed" ||
        event.causality?.messageId !== messageId ||
        event.payload.metadata?.["nativeEntryId"] !== entryId ||
        event.payload.metadata?.["nativeConversationId"] !== conversationId
      )
        throw new Error(
          "Native answer publication changed its original entry identity",
        );
      await waitForPublicationChain(harness, task, context);
    }
    messages.push({
      messageId,
      outcome: assistantOutcome(message),
      text: message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      published: !!pointer,
    });
  }
  if (
    debt.tasks.length !== messages.filter((message) => message.published).length
  )
    throw new Error("Native answer has unrelated publication debt");
  return {
    conversationId,
    entryId,
    taskId: entry.byTaskId ?? null,
    publicationTaskIds: debt.tasks.map((item) => item.taskId),
    messages,
  };
}

/** Join retained predecessors too: a repair incident does not settle dependent tasks. */
async function waitForPublicationChain(
  harness: Harness,
  answerTask: NonNullable<Awaited<ReturnType<Harness["getTask"]>>>,
  context: Context,
): Promise<void> {
  const debt = [answerTask];
  const seen = new Set([answerTask.id]);
  const binding = answerTask.input as unknown as PublicationInput;
  let current = answerTask;
  while (current.state.status !== "terminal") {
    const previousId = (current.input as unknown as PublicationInput).previousTask;
    if (previousId === null) break;
    if (seen.has(previousId))
      throw new Error("Native publication has cyclic ordered debt");
    seen.add(previousId);
    const previous = await harness.getTask(previousId, context);
    const input = previous?.input as PublicationInput | undefined;
    if (
      !previous ||
      previous.kind !== answerTask.kind ||
      previous.version !== answerTask.version ||
      previous.conversationId !== answerTask.conversationId ||
      input?.channelId !== binding.channelId ||
      input.participantId !== binding.participantId
    )
      throw new Error("Native publication lost its ordered predecessor");
    debt.push(previous);
    current = previous;
  }
  for (const task of debt.reverse()) {
    const settled = await harness.waitForTask(task.id, context);
    if (settled.state.outcome.status !== "completed")
      throw new Error(
        "Native answer publication did not deliver its canonical debt",
        { cause: settled.state.outcome },
      );
  }
}

function detached<T>(value: T): T {
  return copyJson(value, { omitUndefinedProperties: true }) as unknown as T;
}
function projection(value: JsonValue): NativeChannelProjection | null {
  return value === null ? null : (value as unknown as NativeChannelProjection);
}
function suppressed(binding: NativeChannelProjection): boolean {
  return binding.policy === "notify-only";
}

/** Read the conversation's original immutable presentation binding without creating state. */
export async function readNativeChannelProjection(
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
): Promise<NativeChannelProjection | null> {
  return projection(
    (await harness.snapshot(Projection, conversationId, context))?.binding ??
      null,
  );
}

/** Native work owns publication debt; the canonical channel owns idempotent acceptance. */
export function createNativeChannelPublication(options: {
  /** Joined with canonical final-answer publication; replay must be idempotent. */
  readonly onSuccessfulAnswer?: (modelRef: string) => Promise<void>;
  readonly publish: (
    channelId: string,
    participantId: string,
    event: AgenticEvent,
    idempotencyKey: string,
    context: Context,
  ) => Promise<{ id?: number } | { recorded: true }>;
}) {
  async function deliver(
    task: RunningTask<PublicationInput, PublicationCheckpoint, null>,
    rt: TaskRuntime<PublicationInput, PublicationCheckpoint, null, object>,
    context: Context,
    abort: boolean,
  ): Promise<void> {
    try {
      const previousId = task.input.previousTask;
      if (previousId !== null) {
        let previous = await rt.getTask(previousId, context);
        if (!previous)
          throw new Error("Native publication lost its ordered predecessor");
        if (previous.state.status !== "terminal") {
          if (abort) previous = await rt.waitForTask(previousId, context);
          else {
            await rt.commit(
              () => ({
                status: "waiting",
                checkpoint: task.state.checkpoint,
                condition: {
                  kind: "tasks",
                  on: [previousId],
                  policy: "allSettled",
                },
              }),
              context,
            );
            return;
          }
        }
        if (
          previous.state.status !== "terminal" ||
          previous.state.outcome.status !== "completed"
        )
          throw new Error(
            "Native publication predecessor did not deliver its debt",
            { cause: previous.state },
          );
      }
      let events = task.state.checkpoint.events;
      if (events === null) {
        events = detached(task.input.events);
        if (task.input.terminal !== null) {
          const publication = task.input
            .terminal as unknown as NativeInvocationTerminalPublication;
          let entry: EntryRecord | undefined;
          if (publication.outcome.status === "completed") {
            const result = publication.outcome.result;
            if (
              result !== null &&
              typeof result === "object" &&
              !Array.isArray(result) &&
              typeof result["entryId"] === "number"
            )
              entry = await rt.entry(
                result["entryId"] as EntryRecord["id"],
                context,
              );
            if (publication.source.operation.kind !== "model" && !entry)
              throw new Error(
                "Native tool terminal has no canonical result entry",
              );
          }
          events.push({
            event: detached(
              terminalEvent(publication, entry, task.input.terminalCreatedAt),
            ) as unknown as JsonValue,
            key: publication.terminalIdempotencyKey,
          });
        }
        const prepared = events;
        await rt.commit(
          (_tx, current) => ({
            status: "running",
            checkpoint: { ...current.state.checkpoint, events: prepared },
          }),
          context,
        );
      }
      const preparedEvents = events;
      let index = task.state.checkpoint.index;
      while (index < preparedEvents.length) {
        const item = preparedEvents[index];
        if (!item) throw new Error("Native publication has invalid progress");
        const event = agenticEventSchema.parse(
          detached(item.event),
        ) as AgenticEvent;
        const accepted = await options.publish(
          task.input.channelId,
          task.input.participantId,
          event,
          item.key,
          context,
        );
        const acceptedByChannel =
          event.kind === "message.read"
            ? "recorded" in accepted && accepted.recorded === true
            : "id" in accepted &&
              Number.isSafeInteger(accepted.id) &&
              (accepted.id ?? -1) >= 0;
        if (!acceptedByChannel)
          throw new Error(
            "Native publication lacks canonical channel acceptance",
          );
        const answer = event.kind === "message.completed"
          ? eventKindSchemas["message.completed"].parse(event)
          : undefined;
        if (
          options.onSuccessfulAnswer &&
          answer?.payload.role === "assistant" &&
          answer.payload.tier === "primary" &&
          answer.payload.outcome === "completed" &&
          !answer.payload.failure
        ) {
          const entryId = answer.payload.metadata?.["nativeEntryId"];
          if (typeof entryId !== "number")
            throw new Error("Successful native answer has no original entry");
          const entry = await rt.entry(entryId as EntryId, context);
          const message = entry?.model?.find(
            (_message, messageIndex) =>
              `native:${entry.conversationId}:${entry.id}:${messageIndex}` ===
              event.causality?.messageId,
          );
          if (
            !message ||
            message.role !== "assistant" ||
            assistantOutcome(message) !== "completed"
          )
            throw new Error(
              "Successful native answer lost its original model response",
            );
          await options.onSuccessfulAnswer(
            `${message.provider}:${message.model}`,
          );
        }
        index++;
        const acknowledged = index;
        await rt.commit(
          (_tx, current) =>
            acknowledged === preparedEvents.length
              ? {
                  status: "terminal",
                  outcome: { status: "completed", result: null },
                }
              : {
                  status: "running",
                  checkpoint: {
                    ...current.state.checkpoint,
                    index: acknowledged,
                  },
                },
          context,
        );
      }
    } catch (error) {
      await rt.parkFailure(error, context);
    }
  }
  const task = defineTask<PublicationInput, PublicationCheckpoint, null>({
    name: "vibestudio.channel-publication",
    version: 1,
    initial: () => ({ phase: "publish", index: 0, events: null }),
    phases: {
      publish: (task, rt, context) => deliver(task, rt, context, false),
    },
    // Explicit cancellation still joins accepted publication debt. Owner close merely leaves it recoverable.
    abort: (task, rt, context) => deliver(task, rt, context, true),
  });
  async function enqueue(
    tx: Tx,
    conversationId: ConversationId,
    binding: NativeChannelProjection,
    events: PublicationInput["events"],
    terminal: NativeInvocationTerminalPublication | null = null,
  ): Promise<TaskId> {
    const state = await tx.doc(Projection, conversationId);
    const id = await tx.createTask(
      task,
      {
        channelId: binding.channelId,
        participantId: binding.participantId,
        previousTask: state.tail,
        events,
        terminalCreatedAt: terminal === null ? null : new Date().toISOString(),
        terminal:
          terminal === null
            ? null
            : (detached(terminal) as unknown as JsonValue),
      },
      { conversationId, ownership: { kind: "conversation" }, background: true },
    );
    state.tail = id;
    return id;
  }
  return {
    task,
    async bind(
      tx: Tx,
      conversationId: ConversationId,
      candidate: NativeChannelProjection,
    ): Promise<void> {
      if (
        !candidate.channelId ||
        !candidate.participantId ||
        !candidate.actor.id ||
        (candidate.reportTo !== undefined &&
          (!candidate.reportTo ||
            candidate.reportTo === candidate.participantId))
      )
        throw new Error(
          "Native channel projection requires an actual channel participant",
        );
      const binding = detached(candidate);
      const state = await tx.doc(Projection, conversationId);
      if (
        state.binding !== null &&
        canonicalJson(state.binding) !== canonicalJson(binding)
      )
        throw new Error(
          "Native channel projection conflicts with its immutable binding",
        );
      state.binding = binding as unknown as JsonValue;
    },
    prepareCommit: (async (tx, staged) => {
      await prepareNativeChannelReadReceipts(
        tx,
        staged.submissions,
        async (receipt) => {
          const binding = projection(
            (await tx.doc(Projection, receipt.conversationId)).binding,
          );
          if (!binding)
            throw new Error("Native channel read has no publication binding");
          const event: AgenticEvent<"message.read"> = {
            kind: "message.read",
            actor: detached(binding.actor),
            causality: { messageId: receipt.messageId as never },
            payload: { protocol: AGENTIC_PROTOCOL_VERSION },
            createdAt: new Date().toISOString(),
          };
          await enqueue(
            tx,
            receipt.conversationId,
            {
              ...binding,
              channelId: receipt.channelId,
              participantId: receipt.participantId,
            },
            [
              {
                event: detached(event) as unknown as JsonValue,
                key: receipt.idempotencyKey,
              },
            ],
          );
        },
      );
      // A final answer must follow its originating invocation terminal in the
      // same durable publication chain. The answer acceptance barrier then
      // also joins that terminal, including delayed acceptance and recovery.
      await prepareNativeInvocationTerminals(
        tx,
        staged.tasks,
        async (tx, publication) => {
          const conversationId = publication.source.task
            .conversationId as ConversationId;
          const binding = projection(
            (await tx.doc(Projection, conversationId)).binding,
          );
          if (!binding)
            throw new Error(
              "Native invocation terminal has no channel projection binding",
            );
          await enqueue(
            tx,
            conversationId,
            {
              ...binding,
              channelId: publication.source.owner.channelId,
              participantId: publication.source.owner.runtimeId,
            },
            [
              {
                event: detached(publication.start) as unknown as JsonValue,
                key: publication.startIdempotencyKey,
              },
            ],
            publication,
          );
        },
      );
      for (const entry of staged.entries) {
        if (entry.kind !== AssistantEntry.kind) continue;
        const binding = projection(
          (await tx.doc(Projection, entry.conversationId)).binding,
        );
        if (!binding) continue;
        const debt = await tx.doc(
          AnswerPublication,
          entry.conversationId,
          String(entry.id),
          null,
        );
        if (debt.channelId)
          throw new Error("Native answer publication was already indexed");
        debt.policy = binding.policy;
        debt.channelId = binding.channelId;
        debt.participantId = binding.participantId;
        for (const [index, message] of (entry.model ?? []).entries()) {
          if (message.role !== "assistant" || suppressed(binding)) continue;
          const secondary = message.stopReason === "toolUse";
          if (binding.policy === "turn-final" && secondary) continue;
          const messageId = `native:${entry.conversationId}:${entry.id}:${index}`;
          const run = await tx.doc(RunPublication, entry.conversationId);
          const taskId = await enqueue(tx, entry.conversationId, binding, [
            {
              event: detached({
                ...assistantEvent(
                  binding,
                  entry,
                  message,
                  messageId,
                  secondary,
                ),
                ...(run.input === null
                  ? {}
                  : {
                      turnId: nativeTurnId(entry.conversationId, run.input),
                    }),
              }) as unknown as JsonValue,
              key: `${messageId}:completed`,
            },
          ]);
          debt.tasks.push({ taskId, index, messageId });
        }
      }
      // Automation lifecycle tasks own prompt, direct Eval and watch ticks alike.
      // Their retained terminal includes completion and effect failures beyond a model answer.
      for (const task of staged.tasks) {
        if (
          task.kind !== "vibestudio.automation-run" ||
          task.state.status === "pending"
        )
          continue;
        const binding = projection(
          (await tx.doc(Projection, task.conversationId)).binding,
        );
        if (!binding || suppressed(binding)) continue;
        const activity = await nativeAutomationPresentation(tx, task);
        if (!activity) continue;
        const cursor = await tx.doc(
          AutomationPublication,
          task.conversationId,
          String(task.id),
          null,
        );
        const turnId =
          `native-automation:${task.conversationId}:${task.id}` as TurnId;
        if (!cursor.opened) {
          const event: AgenticEvent<"turn.opened"> = {
            kind: "turn.opened",
            actor: detached(binding.actor),
            turnId,
            payload: {
              protocol: AGENTIC_PROTOCOL_VERSION,
              metadata: { automation: detached(activity.snapshot) },
            },
            createdAt: new Date().toISOString(),
          };
          await enqueue(tx, task.conversationId, binding, [
            {
              event: detached(event) as unknown as JsonValue,
              key: `${turnId}:opened`,
            },
          ]);
          cursor.opened = true;
        }
        if (task.state.status === "terminal" && !cursor.closed) {
          const result = activity.terminal;
          if (!result)
            throw new Error(
              "Automation lifecycle closed without its original terminal",
            );
          const failed = result.outcome !== "succeeded";
          const event: AgenticEvent<"turn.closed"> = {
            kind: "turn.closed",
            actor: detached(binding.actor),
            turnId,
            payload: {
              protocol: AGENTIC_PROTOCOL_VERSION,
              ...(failed
                ? {
                    reason:
                      result.outcome === "cancelled"
                        ? "user_interrupted"
                        : "work_failed",
                  }
                : {}),
              ...(result.failure?.message ||
              result.finalMessage ||
              result.completionResponse
                ? {
                    summary:
                      result.failure?.message ??
                      result.finalMessage ??
                      result.completionResponse,
                  }
                : {}),
            },
            createdAt: new Date().toISOString(),
          };
          await enqueue(tx, task.conversationId, binding, [
            {
              event: detached(event) as unknown as JsonValue,
              key: `${turnId}:closed`,
            },
          ]);
          cursor.closed = true;
        }
      }
      // Reconcile after answers so closure follows the original terminal answer
      // in the same recoverable delivery chain. Every run transition creates or
      // settles a task/submission; partial-output-only commits cannot change it.
      const conversations = new Set([
        ...staged.tasks.map((task) => task.conversationId),
        ...staged.submissions.map((input) => input.conversationId),
        ...staged.entries.map((entry) => entry.conversationId),
      ]);
      for (const conversationId of conversations) {
        const binding = projection(
          (await tx.doc(Projection, conversationId)).binding,
        );
        if (!binding || suppressed(binding)) continue;
        const live = await tx.doc(LiveDoc, conversationId);
        const nextInput = live.run?.inputs[0] ?? null;
        if (live.run && nextInput === null)
          throw new Error("Native channel run has no admitted input");
        const cursor = await tx.doc(RunPublication, conversationId);
        const wait = live.run
          ? await nativeRunWaitPresentation(tx, staged, live.run.taskId)
          : null;
        const changedRun = cursor.input !== nextInput;
        if (!changedRun && canonicalJson(cursor.wait) === canonicalJson(wait))
          continue;
        if (changedRun && cursor.input !== null) {
          const input = staged.submissions.find(
            (input) => input.id === cursor.input,
          );
          const turnId = nativeTurnId(conversationId, cursor.input);
          const event: AgenticEvent<"turn.closed"> = {
            kind: "turn.closed",
            actor: detached(binding.actor),
            turnId,
            payload: {
              protocol: AGENTIC_PROTOCOL_VERSION,
              ...(input?.status === "unanswered"
                ? {
                    reason:
                      input.reason === "aborted"
                        ? "user_interrupted"
                        : "work_failed",
                  }
                : {}),
            },
            createdAt: new Date().toISOString(),
          };
          await enqueue(tx, conversationId, binding, [
            {
              event: detached(event) as unknown as JsonValue,
              key: `${turnId}:closed`,
            },
          ]);
        }
        if (nextInput !== null && (changedRun || !wait)) {
          const turnId = nativeTurnId(conversationId, nextInput);
          const event: AgenticEvent<"turn.opened" | "turn.resumed"> = {
            kind: changedRun ? "turn.opened" : "turn.resumed",
            actor: detached(binding.actor),
            turnId,
            payload: { protocol: AGENTIC_PROTOCOL_VERSION },
            createdAt: new Date().toISOString(),
          };
          await enqueue(tx, conversationId, binding, [
            {
              event: detached(event) as unknown as JsonValue,
              key: changedRun
                ? `${turnId}:opened`
                : `${turnId}:resumed:${cursor.revision + 1}`,
            },
          ]);
        }
        if (nextInput !== null && wait) {
          const turnId = nativeTurnId(conversationId, nextInput);
          const event: AgenticEvent<"turn.waiting"> = {
            kind: "turn.waiting",
            actor: detached(binding.actor),
            turnId,
            payload: { protocol: AGENTIC_PROTOCOL_VERSION, ...wait },
            createdAt: new Date().toISOString(),
          };
          await enqueue(tx, conversationId, binding, [
            {
              event: detached(event) as unknown as JsonValue,
              key: `${turnId}:waiting:${cursor.revision + 1}`,
            },
          ]);
        }
        cursor.input = nextInput;
        cursor.wait = wait;
        cursor.revision = changedRun ? 0 : cursor.revision + 1;
      }
    }) satisfies NonNullable<HarnessOptions["prepareCommit"]>,
  };
}

function assistantOutcome(
  message: AssistantMessage,
): NativePublishedAnswer["messages"][number]["outcome"] {
  if (message.stopReason === "aborted" || message.stopReason === "error")
    return "interrupted";
  if (
    message.content.some((block) => block.type === "text" && block.text.trim())
  )
    return "completed";
  return message.stopReason === "toolUse" ? "tool_calls_only" : "empty";
}

/** The channel's actual immutable transport envelope for this native answer. */
export function nativeAnswerEnvelopeId(messageId: string): string {
  if (!/^native:[1-9]\d*:[1-9]\d*:(?:0|[1-9]\d*)$/.test(messageId))
    throw new Error(
      "Provider reset requires an actual native answer message ID",
    );
  return `ik:${messageId}:completed`;
}

function assistantEvent(
  binding: NativeChannelProjection,
  entry: EntryRecord,
  message: AssistantMessage,
  messageId: string,
  secondary: boolean,
): AgenticEvent<"message.completed"> {
  const blocks: MessageBlockInput[] = message.content.map((block, index) => {
    const blockId =
      `${messageId}:block:${index}` as MessageBlockInput["blockId"];
    if (block.type === "text")
      return {
        type: "text",
        blockId,
        content: block.text,
        metadata: { pi: detached(block) },
      };
    if (block.type === "thinking")
      return {
        type: "thinking",
        blockId,
        content: block.thinking,
        metadata: { pi: detached(block) },
      };
    // This is the exact model intent, not yet an admitted native invocation with its prepared arguments.
    return { type: "data", blockId, metadata: { pi: detached(block) } };
  });
  const failure =
    message.stopReason === "aborted"
      ? {
          reason: message.errorMessage?.trim() || "Model request cancelled",
          code: "cancelled",
          recoverable: false,
        }
      : message.stopReason === "error"
        ? classifyModelFailure({
            provider: message.provider,
            model: message.model,
            message: message.errorMessage || "Model request failed",
            now: new Date(message.timestamp).toISOString(),
          })
        : undefined;
  return {
    kind: "message.completed",
    actor: detached(binding.actor),
    causality: { messageId: messageId as never },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      role: "assistant",
      blocks,
      tier: secondary ? "secondary" : "primary",
      outcome: assistantOutcome(message),
      ...(!secondary &&
      binding.reportTo &&
      assistantOutcome(message) === "completed"
        ? {
            to: [
              { kind: "participant" as const, participantId: binding.reportTo },
            ],
          }
        : {}),
      ...(failure ? { failure } : {}),
      usage: {
        inputTokens: message.usage.input,
        outputTokens: message.usage.output,
        totalTokens: message.usage.totalTokens,
        costUsd: message.usage.cost.total,
        metadata: { pi: detached(message.usage) },
      },
      model: {
        ref: `${message.provider}/${message.model}`,
        provider: message.provider,
      },
      metadata: {
        nativeEntryId: entry.id,
        nativeConversationId: entry.conversationId,
        nativeTaskId: entry.byTaskId,
        stopReason: message.stopReason,
        errorMessage: message.errorMessage,
      },
    },
    createdAt: new Date(message.timestamp).toISOString(),
  };
}
function terminalEvent(
  publication: NativeInvocationTerminalPublication,
  entry: EntryRecord | undefined,
  createdAt: string | null,
): AgenticEvent {
  if (createdAt === null)
    throw new Error(
      "Native terminal publication has no retained admission timestamp",
    );
  const causality = publication.start.causality;
  if (!causality?.invocationId)
    throw new Error(
      "Native terminal publication has no canonical invocation identity",
    );
  const base = {
    actor: detached(publication.start.actor),
    causality: detached(causality),
    createdAt,
  };
  const outcome = publication.outcome;
  if (outcome.status === "aborted")
    return {
      ...base,
      kind: "invocation.cancelled",
      payload: invocationCancelledPayload(
        "cancelled",
        outcome.reason ?? "Native operation cancelled",
        {},
      ),
    };
  if (outcome.status === "orphaned")
    return {
      ...base,
      kind: "invocation.abandoned",
      payload: invocationAbandonedPayload(outcome.reason),
    };
  let direct: ToolExecutionResult | undefined;
  if (
    publication.source.operation.kind === "direct-tool" &&
    outcome.status === "completed"
  ) {
    const data = entry?.data;
    if (
      entry?.kind !== DirectToolResultEntry.kind ||
      data == null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      data["sourceEntryId"] !== publication.source.operation.directEntryId ||
      data["callId"] !== publication.source.operation.callId ||
      data["name"] !== publication.source.operation.name ||
      data["result"] === null ||
      typeof data["result"] !== "object" ||
      Array.isArray(data["result"])
    )
      throw new Error(
        "Native direct tool terminal changed its canonical source/result binding",
      );
    direct = data["result"] as ToolExecutionResult;
  }
  const modelResults =
    entry?.model?.filter((message) => message.role === "toolResult") ?? [];
  const result = direct ?? modelResults[0];
  if (
    publication.source.operation.kind === "tool" &&
    outcome.status === "completed" &&
    (!entry ||
      !ToolResultEntry.is(entry) ||
      modelResults.length !== 1 ||
      modelResults[0]?.toolCallId !== publication.source.operation.callId ||
      modelResults[0]?.toolName !== publication.source.operation.name)
  )
    throw new Error(
      "Native tool terminal changed its canonical source/result binding",
    );
  if (
    outcome.status === "faulted" ||
    outcome.status === "failed" ||
    result?.isError
  ) {
    const error =
      outcome.status === "faulted" || outcome.status === "failed"
        ? outcome.error
        : {
            message: (result?.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => (block.type === "text" ? block.text : ""))
              .join("\n"),
            details: result?.details,
          };
    const failure = agentToolFailureFromUnknown(error, {
      operation:
        publication.source.operation.kind !== "model"
          ? publication.source.operation.name
          : `model.${publication.source.operation.purpose}`,
      stage: "native-terminal",
      kind: outcome.status === "faulted" ? "infrastructure" : undefined,
      causal: { invocationId: causality.invocationId },
      retry: { policy: "none" },
    });
    return {
      ...base,
      kind: "invocation.failed",
      payload: invocationFailedPayload(
        failure.kind === "infrastructure"
          ? "infrastructure_error"
          : "tool_error",
        failure.message,
        { failure, error: detached(error) },
      ),
    };
  }
  return {
    ...base,
    kind: "invocation.completed",
    payload: invocationCompletedPayload({
      result:
        publication.source.operation.kind === "model"
          ? {
              nativeOutcome: outcome.result,
              ...(entry ? { entry: detached(entry) } : {}),
            }
          : {
              protocolContent: detached(result?.content ?? []),
              ...(result?.details === undefined
                ? {}
                : { details: detached(result.details) }),
            },
    }),
  };
}
