import {
  copyJson,
  type Context,
  type JsonRepresentation,
  type JsonValue,
} from "@panticonic/pi-chord";
import {
  acceptReceipt,
  bindTool,
  bindReceipt,
  createDirectToolTask,
  defineDocFamily,
  defineTask,
  DirectToolResultEntry,
  ReceiptDoc,
  LiveDoc,
  type Conversation,
  type ConversationId,
  type Harness,
  type HarnessCommit,
  type JsonObject,
  type SubmissionId,
  type TaskId,
  type TaskRecord,
  type ToolExecutionApi,
  type ToolTaskResult,
  ToolResultEntry,
  type Tx,
} from "@panticonic/pi-durable";
import {
  missionCompletionResponse,
  type AutomationExecutorRunStatus,
  type MissionRunEffectFailure,
} from "@vibestudio/automation/mission";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { missionsMethods } from "@vibestudio/service-schemas/missions";
import { nativeInvocationId } from "@vibestudio/service-schemas/nativeInvocation";
import { retainedAgentExecutionOwnerInTransaction } from "./native-agent-session.js";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";
import type { AutomationActivitySnapshot } from "@workspace/agentic-core";
import { recordNativeChannelInputAdmission } from "./native-channel-session.js";
import {
  nativeProductTask,
  nativeProductInput,
  nativeTaskProductContext,
  recordNativeProductInput,
  recordNativeProductTask,
} from "./native-product-context.js";

type ToolBinding = ReturnType<typeof bindTool>;
function detached<T>(value: T): JsonRepresentation<T> {
  return copyJson(value, {
    omitUndefinedProperties: true,
  }) as JsonRepresentation<T>;
}
type Metadata = NonNullable<AgentProductMetadata["automation"]>;
type Terminal = Extract<AutomationExecutorRunStatus, { state: "terminal" }>;
type Input = {
  runId: string;
  channelId: string;
  automation: JsonRepresentation<Metadata>;
} & (
  | { kind: "prompt"; submissionId: SubmissionId }
  | { kind: "direct"; args: JsonObject; binding: ToolBinding }
);
type State =
  | { phase: "start" }
  | { phase: "direct"; child: TaskId<ToolTaskResult> }
  | { phase: "signal"; prompt: string }
  | { phase: "input"; submissionId: SubmissionId };
const Runs = defineDocFamily<
  {
    binding: string;
    channelId: string;
    conversationId: number;
    taskId: number;
    inputId: number | null;
    terminal: JsonRepresentation<Terminal> | null;
    completion: string | null;
    effectFailures: JsonRepresentation<MissionRunEffectFailure>[];
    acknowledged: boolean;
  },
  null
>({
  kind: "vibestudio.automation-run",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({
    binding: "",
    channelId: "",
    conversationId: 0,
    taskId: 0,
    inputId: null,
    terminal: null,
    completion: null,
    effectFailures: [],
    acknowledged: false,
  }),
  checkpointWhen: () => true,
});
function receiptKey(runId: string) {
  return `automation:${runId}:input`;
}
function metadata(automation: Metadata, direct: boolean): AgentProductMetadata {
  return {
    origin: "scheduled",
    automation,
    delivery: direct && automation.action === "watch" ? "none" : "channel",
    ...(direct
      ? {
          completion:
            automation.action === "watch"
              ? "when-signaled"
              : "after-invocation",
        }
      : { deliverAfterTurn: true }),
  };
}
function tickPrompt(prompt: string): string {
  return `${prompt.trim()}\n\n<automation-tick>\nThis is one admitted recurring-automation tick. If this tick establishes that the recurring goal is naturally finished and no future tick is needed, call complete_automation exactly once with a concise completion response. Otherwise finish normally so the schedule continues. Do not call complete_automation merely because this individual tick succeeded.\n</automation-tick>`;
}
function terminal(input: Input, taskId: TaskId, failed?: string): Terminal {
  return {
    state: "terminal",
    channelId: input.channelId,
    nativeTaskId: taskId,
    outcome: failed ? "failed" : "succeeded",
    ...(failed
      ? {
          failure: {
            code: "EAGENTTURN",
            stage: "executing",
            message: failed,
            retry: "manual",
          },
        }
      : {}),
  };
}

/** Public presentation derived from the original native lifecycle and its admitted provenance. */
export async function nativeAutomationPresentation(
  tx: Tx,
  task: TaskRecord<JsonValue, JsonValue, JsonValue>,
) {
  if (task.kind !== "vibestudio.automation-run") return null;
  const product = await nativeProductTask(tx, task.id);
  const original = product.metadata?.automation;
  if (!original || !product.channelId)
    throw new Error("Automation presentation lost its original provenance");
  const run = await tx.doc(Runs, original.runId, null);
  if (
    run.taskId !== task.id ||
    run.channelId !== product.channelId ||
    run.conversationId !== task.conversationId
  )
    throw new Error(
      "Automation presentation changed its actual lifecycle owner",
    );
  const {
    missionId,
    runId,
    name,
    revision,
    action,
    trigger,
    startedAt,
    createdAt,
    activatedAt,
    runNumber,
    schedule,
  } = original;
  const snapshot: AutomationActivitySnapshot = {
    missionId,
    runId,
    name,
    revision,
    action,
    trigger,
    startedAt,
    createdAt,
    ...(activatedAt === undefined ? {} : { activatedAt }),
    ...(runNumber === undefined ? {} : { runNumber }),
    schedule: schedule === null ? null : { ...schedule },
  };
  return { snapshot, terminal: run.terminal };
}
export interface NativeAutomationHost {
  harness(): Harness;
  /** Resolves one existing, genuinely owned channel conversation; never manufactures a binding. */
  conversation(channelId: string, context: Context): Promise<Conversation>;
  /** Calls the canonical admitted MissionsDO using this executor's attributed caller. */
  finishRun(input: import("zod").z.input<typeof missionsMethods.finishRun.args>[0], context: Context): Promise<void>;
}

/** Product run association and acknowledgement debt; every operation executes in the actual native scheduler. */
export function createNativeAutomationRuns(host: NativeAutomationHost) {
  const Finish = defineTask<
    { runId: string; terminal: JsonRepresentation<Terminal> },
    { phase: "finish" },
    null
  >({
    name: "vibestudio.automation-finish",
    version: 1,
    initial: () => ({ phase: "finish" }),
    phases: {
      finish: async (task, runtime, context) => {
        const value = task.input.terminal;
        const original = await runtime.snapshot(
          Runs,
          task.input.runId,
          context,
        );
        if (
          !original?.terminal ||
          canonicalJson(original.terminal) !== canonicalJson(value)
        )
          throw new Error(
            "Automation acknowledgement has no exact terminal receipt",
          );
        const input = missionsMethods.finishRun.args.parse([
          {
            runId: task.input.runId,
            outcome: value.outcome,
            ...(value.finalMessage ? { finalMessage: value.finalMessage } : {}),
            ...(value.completionResponse
              ? { completionResponse: value.completionResponse }
              : {}),
            ...(value.failure ? { failure: value.failure } : {}),
            ...(value.effectFailures
              ? { effectFailures: value.effectFailures }
              : {}),
          },
        ])[0];
        try {
          await host.finishRun(input, context);
        } catch (error) {
          if (runtime.signal.aborted) throw error;
          await runtime.parkFailure(error, context);
          return;
        }
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: { status: "completed", result: null },
          }),
          context,
        );
      },
    },
    // Delivery remains owned until successful canonical acceptance, including owner retirement.
    abort: async (task, runtime, context) => {
      const value = task.input.terminal;
      const original = await runtime.snapshot(Runs, task.input.runId, context);
      if (
        !original?.terminal ||
        canonicalJson(original.terminal) !== canonicalJson(value)
      )
        throw new Error(
          "Automation acknowledgement has no exact terminal receipt",
        );
      const input = missionsMethods.finishRun.args.parse([
        {
          runId: task.input.runId,
          outcome: value.outcome,
          ...(value.finalMessage ? { finalMessage: value.finalMessage } : {}),
          ...(value.completionResponse
            ? { completionResponse: value.completionResponse }
            : {}),
          ...(value.failure ? { failure: value.failure } : {}),
          ...(value.effectFailures
            ? { effectFailures: value.effectFailures }
            : {}),
        },
      ])[0];
      try {
        await host.finishRun(input, context);
      } catch (error) {
        await runtime.parkFailure(error, context);
        return;
      }
      await runtime.commit(
        () => ({
          status: "terminal",
          outcome: { status: "aborted", result: null },
        }),
        context,
      );
    },
  });
  const Lifecycle = defineTask<Input, State, JsonRepresentation<Terminal>>({
    name: "vibestudio.automation-run",
    version: 1,
    initial: () => ({ phase: "start" }),
    phases: {
      start: async (task, runtime, context) => {
        if (task.input.kind === "prompt") {
          const input = task.input;
          const run = await runtime.snapshot(Runs, input.runId, context);
          if (!run?.binding)
            throw new Error("Automation prompt lost its original admission");
          await runtime.commit(
            () => ({
              status: "waiting",
              checkpoint: { phase: "input", submissionId: input.submissionId },
              condition: {
                kind: "receipt",
                key: receiptKey(input.runId),
                binding: run.binding,
              },
            }),
            context,
          );
          return;
        }
        const input = task.input;
        await runtime.commit(async (tx) => {
          const child = await createDirectToolTask(
            tx,
            runtime.conversationId,
            {
              id: `automation:${input.runId}:eval`,
              name: input.binding.name,
              arguments: input.args,
            },
            input.binding,
            { ownership: { kind: "task", taskId: runtime.taskId } },
          );
          return {
            status: "waiting",
            checkpoint: { phase: "direct", child },
            condition: { kind: "tasks", on: [child], policy: "allSettled" },
          };
        }, context);
      },
      direct: async (task, runtime, context) => {
        const [outcome] = await runtime.outcomes(
          [task.state.checkpoint.child],
          context,
        );
        if (!outcome || outcome.status !== "completed") {
          const failure =
            outcome && "error" in outcome
              ? (outcome.error?.message ??
                "Automation direct invocation did not complete")
              : "Automation direct invocation did not complete";
          await runtime.commit(
            () => ({
              status: "terminal",
              outcome: {
                status: "completed",
                result: detached(terminal(task.input, runtime.taskId, failure)),
              },
            }),
            context,
          );
          return;
        }
        const entry = await runtime.entry(
          DirectToolResultEntry,
          outcome.result.entryId,
          context,
        );
        if (!entry?.data || entry.model !== undefined)
          throw new Error(
            "Automation direct invocation lost its genuine direct result",
          );
        const result = entry.data.result;
        if (!result || typeof result !== "object" || Array.isArray(result))
          throw new Error(
            "Automation direct invocation has no structured native result",
          );
        const details = result["details"];
        const value =
          details && typeof details === "object" && !Array.isArray(details)
            ? task.input.automation.action === "tool"
              ? details
              : details["returnValue"]
            : undefined;
        if (task.input.automation.action === "watch" && !result["isError"]) {
          if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            value["protocol"] !== "automation-signal.v1" ||
            !(
              value["prompt"] === null ||
              (typeof value["prompt"] === "string" && value["prompt"].trim())
            )
          ) {
            await runtime.commit(
              () => ({
                status: "terminal",
                outcome: {
                  status: "completed",
                  result: detached(
                    terminal(
                      task.input,
                      runtime.taskId,
                      "Watch must return automation-signal.v1 with a nonempty prompt or null.",
                    ),
                  ),
                },
              }),
              context,
            );
            return;
          }
          if (typeof value["prompt"] === "string") {
            await runtime.commit(
              () => ({
                status: "running",
                checkpoint: {
                  phase: "signal",
                  prompt: value["prompt"] as string,
                },
              }),
              context,
            );
            return;
          }
        }
        const completion = missionCompletionResponse(value);
        const ended = terminal(
          task.input,
          runtime.taskId,
          result["isError"] ? canonicalJson(result) : undefined,
        );
        if (completion && !result["isError"]) {
          ended.completionResponse = completion.response;
          ended.finalMessage = completion.response;
        }
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: { status: "completed", result: detached(ended) },
          }),
          context,
        );
      },
      signal: async (task, runtime, context) => {
        const conversation = await runtime.conversation(
          runtime.conversationId,
          context,
        );
        if (!conversation)
          throw new Error("Automation signal lost its owned conversation");
        const admission = await runtime.snapshot(
          Runs,
          task.input.runId,
          context,
        );
        if (!admission?.binding)
          throw new Error("Automation signal lost its original admission");
        const input = task.input;
        try {
          const submission = await conversation.submit(
            {
              type: "input",
              requestId: `automation:${input.runId}:signal`,
              whenBusy: "followUp",
              content: async (tx, id) => {
                const original = await tx.doc(Runs, input.runId, null);
                if (original.binding !== admission.binding)
                  throw new Error(
                    "Automation signal changed its original admission",
                  );
                original.inputId = id;
                await recordNativeChannelInputAdmission(
                  tx,
                  runtime.conversationId,
                  id,
                );
                await recordNativeProductInput(
                  tx,
                  id,
                  input.channelId,
                  metadata(input.automation, false),
                );
                return task.state.checkpoint.prompt;
              },
            },
            context,
          );
          await runtime.commit(
            () => ({
              status: "waiting",
              checkpoint: { phase: "input", submissionId: submission.id },
              condition: {
                kind: "receipt",
                key: receiptKey(input.runId),
                binding: admission.binding,
              },
            }),
            context,
          );
        } catch (error) {
          if (runtime.signal.aborted) throw error;
          await runtime.parkFailure(error, context);
        }
      },
      input: async (task, runtime, context) => {
        const receipt = await runtime.snapshot(
          ReceiptDoc,
          receiptKey(task.input.runId),
          context,
        );
        if (!receipt?.result)
          throw new Error(
            "Automation input has no canonical native settlement",
          );
        const submission = await host
          .harness()
          .submission(task.state.checkpoint.submissionId, context);
        if (!submission)
          throw new Error("Automation input lost its actual native submission");
        const record = await submission.status(context);
        if (
          record.id !== task.state.checkpoint.submissionId ||
          record.conversationId !== runtime.conversationId ||
          record.type !== "input"
        )
          throw new Error(
            "Automation settlement belongs to another native input",
          );
        const ended = terminal(
          task.input,
          runtime.taskId,
          record.status === "unanswered"
            ? typeof record.detail === "string"
              ? record.detail
              : record.reason
            : undefined,
        );
        if (record.status === "done") {
          const answer = await runtime.entry(record.answer, context);
          const message = answer?.model?.[0];
          if (message?.role !== "assistant")
            throw new Error("Automation input lost its actual native answer");
          const text = message.content
            .flatMap((item) => (item.type === "text" ? [item.text] : []))
            .join("\n");
          if (text) ended.finalMessage = text;
          const run = await runtime.snapshot(Runs, task.input.runId, context);
          if (run?.effectFailures.length) {
            ended.outcome = "completed-with-errors";
            ended.effectFailures = detached(run.effectFailures);
          }
          if (run?.completion) {
            ended.completionResponse = run.completion;
            ended.finalMessage ??= run.completion;
          }
        }
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: { status: "completed", result: detached(ended) },
          }),
          context,
        );
      },
    },
    abort: async (task, runtime, context) => {
      const run = await runtime.snapshot(Runs, task.input.runId, context);
      if (!run?.binding)
        throw new Error("Automation cancellation lost its original admission");
      if (run.inputId !== null) {
        const submission = await host
          .harness()
          .submission(run.inputId as SubmissionId, context);
        if (!submission)
          throw new Error("Automation cancellation lost its actual input");
        await submission.abort(context);
        const record = await submission.status(context);
        if (record.status === "queued" || record.status === "placed") {
          await runtime.commit(
            () => ({
              status: "waiting",
              checkpoint: task.state.checkpoint,
              condition: {
                kind: "receipt",
                key: receiptKey(task.input.runId),
                binding: run.binding,
              },
            }),
            context,
          );
          return;
        }
      }
      const ended = {
        ...terminal(task.input, runtime.taskId),
        outcome: "cancelled" as const,
      };
      await runtime.commit(
        () => ({
          status: "terminal",
          outcome: { status: "aborted", result: detached(ended) },
        }),
        context,
      );
    },
  });

  async function existing(
    channelId: string,
    automation: Metadata,
    binding: string,
    context: Context,
  ) {
    if (!channelId || !automation.runId)
      throw new Error("Automation requires its original admitted provenance");
    const record = await host
      .harness()
      .snapshot(Runs, automation.runId, context);
    if (!record?.binding) return null;
    if (record.binding !== binding || record.channelId !== channelId)
      throw new Error("Automation run conflicts with its original admission");
    return record;
  }
  async function retain(
    tx: Tx,
    conversationId: ConversationId,
    taskId: TaskId,
    channelId: string,
    automation: Metadata,
    binding: string,
    inputId: SubmissionId | null,
  ) {
    const record = await tx.doc(Runs, automation.runId, null);
    if (record.binding) throw new Error("Automation run is already admitted");
    record.binding = binding;
    record.channelId = channelId;
    record.conversationId = conversationId;
    record.taskId = taskId;
    record.inputId = inputId;
    await bindReceipt(tx, receiptKey(automation.runId), binding);
    await recordNativeProductTask(
      tx,
      taskId,
      channelId,
      metadata(automation, inputId === null),
    );
  }
  return {
    tasks: [Lifecycle, Finish],
    admitPrompt: async (
      channelId: string,
      prompt: string,
      automation: Metadata,
      context: Context,
    ): Promise<void> => {
      if (!prompt.trim())
        throw new Error("Automation prompt requires nonempty text");
      const binding = sha256HexSyncText(
        canonicalJson({ channelId, prompt, automation }),
      );
      const conversation = await host.conversation(channelId, context);
      if (await existing(channelId, automation, binding, context)) return;
      const submission = await conversation.submit(
        {
          type: "input",
          requestId: `automation:${automation.runId}`,
          whenBusy: "followUp",
          content: async (tx, id) => {
            const taskId = await tx.createTask(
              Lifecycle,
              {
                kind: "prompt",
                channelId,
                runId: automation.runId,
                automation: detached(automation),
                submissionId: id,
              },
              {
                ownership: { kind: "conversation" },
                conversationId: conversation.id,
                background: true,
              },
            );
            await retain(
              tx,
              conversation.id,
              taskId,
              channelId,
              automation,
              binding,
              id,
            );
            await recordNativeProductInput(
              tx,
              id,
              channelId,
              metadata(automation, false),
            );
            await recordNativeChannelInputAdmission(tx, conversation.id, id);
            return tickPrompt(prompt);
          },
        },
        context,
      );
      const admitted = await existing(channelId, automation, binding, context);
      if (!admitted || admitted.inputId !== submission.id)
        throw new Error("Automation prompt lost its exact original admission");
    },
    admitTool: async (
      channelId: string,
      args: JsonObject,
      tool: ToolBinding,
      automation: Metadata,
      context: Context,
    ): Promise<void> => {
      const binding = sha256HexSyncText(
        canonicalJson({ channelId, args, tool, automation }),
      );
      const conversation = await host.conversation(channelId, context);
      if (await existing(channelId, automation, binding, context)) return;
      await conversation.commit(async (tx) => {
        const previous = await tx.doc(Runs, automation.runId, null);
        if (previous?.binding) {
          if (previous.binding !== binding || previous.channelId !== channelId)
            throw new Error(
              "Automation run conflicts with its original admission",
            );
          return;
        }
        const taskId = await tx.createTask(
          Lifecycle,
          {
            kind: "direct",
            channelId,
            runId: automation.runId,
            automation: detached(automation),
            args,
            binding: tool,
          },
          {
            ownership: { kind: "conversation" },
            conversationId: conversation.id,
            background: true,
          },
        );
        await retain(
          tx,
          conversation.id,
          taskId,
          channelId,
          automation,
          binding,
          null,
        );
      }, context);
    },
    prepare: async (tx: Tx, staged: HarnessCommit): Promise<void> => {
      for (const entry of staged.entries) {
        if (!ToolResultEntry.is(entry)) continue;
        const message = entry.model?.[0];
        if (
          message?.role !== "toolResult" ||
          !message.isError ||
          entry.byTaskId === undefined
        )
          continue;
        const task = staged.tasks.find(
          (candidate) => candidate.id === entry.byTaskId,
        );
        if (!task || (task.kind !== "pi.tool" && task.kind !== "pi.generation"))
          throw new Error("Automation effect has no genuine native task");
        const contextTask = task.kind === "pi.tool" ? task.owner : task.id;
        if (contextTask === undefined)
          throw new Error("Automation effect lost its owning generation");
        const product = await nativeProductTask(tx, contextTask);
        const runId = product.metadata?.automation?.runId;
        if (!runId) continue;
        const run = await tx.doc(Runs, runId, null);
        if (
          !run.binding ||
          run.channelId !== product.channelId ||
          run.conversationId !== task.conversationId
        )
          throw new Error("Automation effect changed its original run");
        let source: MissionRunEffectFailure["source"];
        if (task.kind === "pi.tool") {
          const input = task.input;
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error(
              "Automation effect has no genuine native task input",
            );
          const original = input["source"];
          if (
            !original ||
            typeof original !== "object" ||
            Array.isArray(original) ||
            original["kind"] !== "assistant" ||
            typeof original["entryId"] !== "number" ||
            input["callId"] !== message.toolCallId
          )
            throw new Error(
              "Automation effect has no exact original provider call",
            );
          const owner = await retainedAgentExecutionOwnerInTransaction(tx);
          const invocationId = nativeInvocationId({
            owner: {
              runtimeId: owner.runtimeId,
              authoritySessionId: owner.authoritySessionId,
            },
            task: { taskId: task.id, conversationId: task.conversationId },
            operation: {
              kind: "tool",
              assistantEntryId: original["entryId"],
              callId: message.toolCallId,
            },
          });
          source = {
            kind: "native-tool",
            invocationId,
            nativeTaskId: task.id,
            nativeEntryId: entry.id,
          };
        } else {
          const assistant = staged.entries.find(
            (candidate) =>
              candidate.byTaskId === task.id &&
              candidate.model?.some(
                (item) =>
                  item.role === "assistant" &&
                  item.content.some(
                    (part) =>
                      part.type === "toolCall" &&
                      part.id === message.toolCallId,
                  ),
              ),
          );
          if (!assistant)
            throw new Error(
              "Rejected automation call lost its actual assistant source",
            );
          source = {
            kind: "provider-call",
            nativeTaskId: task.id,
            nativeEntryId: entry.id,
            assistantEntryId: assistant.id,
            callId: message.toolCallId,
          };
        }
        const diagnostic = entry.data.diagnostics[0];
        if (
          !run.effectFailures.some(
            (failure) => failure.source.nativeEntryId === entry.id,
          )
        )
          run.effectFailures.push({
            source,
            name: message.toolName,
            outcome:
              diagnostic?.code === "aborted" ? "cancelled" : "tool_error",
            code: diagnostic?.code ?? "tool_error",
            message:
              diagnostic?.message ??
              message.content
                .flatMap((item) => (item.type === "text" ? [item.text] : []))
                .join("\n"),
          });
      }
      for (const record of staged.submissions) {
        if (
          record.type !== "input" ||
          (record.status !== "done" && record.status !== "unanswered")
        )
          continue;
        const product = await nativeProductInput(tx, record.id);
        const runId = product?.metadata?.automation?.runId;
        if (!runId) continue;
        const run = await tx.doc(Runs, runId, null);
        if (
          !run?.binding ||
          run.inputId !== record.id ||
          run.conversationId !== record.conversationId
        )
          continue;
        await acceptReceipt(
          tx,
          receiptKey(runId),
          run.binding,
          copyJson(record, { omitUndefinedProperties: true }),
        );
      }
      for (const task of staged.tasks) {
        if (
          task.kind !== Lifecycle.definition.name ||
          task.state.status !== "terminal"
        )
          continue;
        const input = task.input as JsonRepresentation<Input>;
        const result = task.state.outcome.result;
        const value = result
          ? (result as JsonRepresentation<Terminal>)
          : detached(
              terminal(
                input,
                task.id,
                "error" in task.state.outcome
                  ? (task.state.outcome.error?.message ??
                      "Automation direct invocation did not complete")
                  : "Automation execution did not complete",
              ),
            );
        const run = await tx.doc(Runs, input.runId, null);
        if (run.taskId !== task.id || run.channelId !== input.channelId)
          throw new Error("Automation terminal changed its actual owner");
        if (run.terminal) continue;
        run.terminal = value;
        await tx.createTask(
          Finish,
          { runId: input.runId, terminal: value },
          {
            ownership: { kind: "conversation" },
            conversationId: task.conversationId,
            background: true,
          },
        );
      }
    },
    describe: async (
      channelId: string,
      runId: string,
      context: Context,
    ): Promise<AutomationExecutorRunStatus> => {
      const run = await host.harness().snapshot(Runs, runId, context);
      if (!run?.binding) return { state: "not-found" };
      if (run.channelId !== channelId)
        throw new Error("Automation run belongs to another channel");
      if (run.acknowledged) return { state: "not-found" };
      if (run.terminal) return detached(run.terminal);
      const task = await host.harness().getTask(run.taskId as TaskId, context);
      if (!task)
        throw new Error("Automation lost its actual native lifecycle task");
      if (run.inputId !== null) {
        const submission = await host
          .harness()
          .submission(run.inputId as SubmissionId, context);
        if (!submission)
          throw new Error("Automation lost its actual native input");
        if ((await submission.status(context)).status === "queued")
          return { state: "queued", channelId };
        const live = await host
          .harness()
          .snapshot(LiveDoc, run.conversationId as ConversationId, context);
        if (live?.run?.inputs.includes(run.inputId as SubmissionId)) {
          const generation = await host
            .harness()
            .getTask(live.run.taskId, context);
          if (!generation)
            throw new Error(
              "Automation input lost its genuine native generation",
            );
          return {
            state: "running",
            channelId,
            nativeTaskId: task.id,
            waiting: generation.state.status === "waiting",
          };
        }
      }
      return {
        state: "running",
        channelId,
        nativeTaskId: task.id,
        waiting: task.state.status === "waiting",
      };
    },
    acknowledge: async (
      channelId: string,
      runId: string,
      context: Context,
    ): Promise<void> => {
      const previous = await host.harness().snapshot(Runs, runId, context);
      if (!previous?.terminal) return;
      if (previous.channelId !== channelId)
        throw new Error(
          "Automation acknowledgement belongs to another channel",
        );
      await host.harness().commit(async (tx) => {
        const run = await tx.doc(Runs, runId, null);
        if (!run?.terminal) return;
        if (run.channelId !== channelId)
          throw new Error(
            "Automation acknowledgement belongs to another channel",
          );
        (await tx.doc(Runs, runId, null)).acknowledged = true;
      }, context);
    },
    drain: async (context: Context): Promise<void> => {
      const harness = host.harness();
      const live = await harness.inspect(context);
      for (const { record: task } of live.tasks) {
        if (task.kind !== Finish.definition.name) continue;
        if (
          task.state.status === "waiting" &&
          task.state.condition.kind === "failure"
        )
          await harness.retryTask(
            task.id,
            task.state.condition.incident,
            context,
          );
        const settled = await harness.waitForTask(task.id, context);
        if (
          settled.state.outcome.status !== "completed" &&
          settled.state.outcome.status !== "aborted"
        )
          throw new Error("Automation finish acknowledgement did not settle", {
            cause: settled.state.outcome,
          });
      }
    },
    recordCompletion: async (
      api: Pick<ToolExecutionApi, "taskId" | "commit">,
      runId: string,
      channelId: string,
      response: string,
      context: Context,
    ): Promise<void> => {
      const value = response.trim();
      if (!value || value.length > 24000)
        throw new Error(
          "complete_automation requires a response of at most 24000 characters",
        );
      const product = await nativeTaskProductContext(
        host.harness(),
        api.taskId,
        context,
      );
      if (
        product?.metadata?.automation?.runId !== runId ||
        product.channelId !== channelId
      )
        throw new Error(
          "Automation completion does not belong to the actual native tool",
        );
      await api.commit(async (tx) => {
        const original = await tx.doc(Runs, runId, null);
        if (
          !original?.binding ||
          original.channelId !== channelId ||
          original.terminal
        )
          throw new Error("complete_automation has no active original run");
        const run = await tx.doc(Runs, runId, null);
        if (run.completion !== null && run.completion !== value)
          throw new Error(
            "Automation completion conflicts with its original response",
          );
        run.completion = value;
      }, context);
    },
  };
}
