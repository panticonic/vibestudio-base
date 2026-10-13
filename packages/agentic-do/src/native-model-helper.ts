import type {
  Api,
  AssistantMessage,
  Context as ModelContext,
  Model,
} from "@panticonic/pi-ai";
import {
  copyJson,
  type Context,
  type JsonRepresentation,
} from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  defineTask,
  type Conversation,
  type EntryId,
  type Harness,
  type ToolExecutionApi,
} from "@panticonic/pi-durable";

type Input = {
  model: JsonRepresentation<Model<Api>>;
  transcript: JsonRepresentation<ModelContext>;
  options: { temperature?: number; maxTokens?: number };
  cutoff: EntryId;
};
type Checkpoint = { phase: "request" };
type Result = JsonRepresentation<AssistantMessage>;

/** One-shot inference is an actual native task, using generation's request port. */
export const NativeModelHelperTask = defineTask<Input, Checkpoint, Result>({
  name: "vibestudio.model-helper",
  version: 1,
  initial: () => ({ phase: "request" }),
  phases: {
    request: async (current, runtime, context) => {
      const { model, transcript, options, cutoff } = current.input;
      const response = await runtime.withModelRequest(
        {
          purpose: "generation",
          operation: "complete",
          attempt: 0,
          model,
          messages: transcript.messages,
          cutoff,
          options: {
            ...(options.maxTokens === undefined
              ? {}
              : { maxTokens: options.maxTokens }),
          },
        },
        (capabilities, signal, prepared) =>
          runtime.models.complete(
            prepared.model,
            { ...transcript, messages: prepared.messages },
            { ...capabilities, ...options, signal },
          ),
        context,
      );
      if (response.status === "waiting") {
        await runtime.commit(
          () => ({
            status: "waiting",
            checkpoint: current.state.checkpoint,
            condition: response.condition,
          }),
          context,
        );
        return;
      }
      if (
        response.result.stopReason === "error" ||
        response.result.stopReason === "aborted"
      ) {
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: {
              status: "failed",
              error: {
                message:
                  response.result.errorMessage ||
                  `Model request ${response.result.stopReason}`,
                detail: { stopReason: response.result.stopReason },
              },
            },
          }),
          context,
        );
        return;
      }
      await runtime.commit(
        () => ({
          status: "terminal",
          outcome: {
            status: "completed",
            result: copyJson(response.result, {
              omitUndefinedProperties: true,
            }) as Result,
          },
        }),
        context,
      );
    },
  },
  abort: async (_current, runtime, context) => {
    await runtime.commit(
      () => ({ status: "terminal", outcome: { status: "aborted" } }),
      context,
    );
  },
});

/** Await exactly this helper; cancellation marks and joins its owned native work. */
export async function completeNativeModelHelper(
  harness: Harness,
  conversation: Conversation,
  selected: Model<Api>,
  transcript: ModelContext,
  options: Input["options"],
  context: Context,
  parent?: ToolExecutionApi,
): Promise<AssistantMessage> {
  context.abortSignal?.throwIfAborted();
  // Admission completes without caller cancellation so a racing abort cannot
  // strand a committed task whose ID the caller never received.
  const taskId = await conversation.commit(async (tx) => {
    const marker = await tx.appendEntry(conversation.id, {
      kind: "vibestudio.model-helper-request",
    });
    return tx.createTask(
      NativeModelHelperTask,
      {
        model: copyJson(selected, {
          omitUndefinedProperties: true,
        }) as Input["model"],
        transcript: copyJson(transcript, {
          omitUndefinedProperties: true,
        }) as Input["transcript"],
        options: copyJson(options, {
          omitUndefinedProperties: true,
        }) as Input["options"],
        cutoff: marker.id,
      },
      {
        ownership: parent
          ? { kind: "task", taskId: parent.taskId }
          : { kind: "conversation" },
        background: parent === undefined,
        abandonOnRestart: true,
      },
    );
  }, BACKGROUND_CONTEXT);
  try {
    const settled = await harness.waitForTask(taskId, context);
    const outcome = settled.state.outcome;
    if (outcome.status === "failed" || outcome.status === "faulted")
      throw new Error(outcome.error.message, { cause: outcome.error });
    if (outcome.status !== "completed")
      throw new Error(
        outcome.reason ?? `Native model helper ${outcome.status}`,
      );
    return outcome.result;
  } catch (error) {
    try {
      await harness.abortTask(taskId, BACKGROUND_CONTEXT);
      await harness.waitForTask(taskId, BACKGROUND_CONTEXT);
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Model helper failed and owned task cleanup failed",
        { cause: error },
      );
    }
    throw error;
  }
}
