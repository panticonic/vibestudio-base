import type {
  Api,
  AssistantMessage,
  Context as ModelContext,
  Model,
  Models,
  SamplingParams,
  ThinkingLevel,
  ToolChoice,
  Usage,
} from "@panticonic/pi-ai";
import {
  copyJson,
  type Context,
  type JsonRepresentation,
  type JsonValue,
} from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  DecisionUnsupportedError,
  openAIChatMessages,
  scoreReplies,
  type NativeDecisionScores,
} from "./native-model-score.js";
import {
  defineDoc,
  defineDocFamily,
  defineTask,
  type Conversation,
  type EntryId,
  type Harness,
  type ModelRequestCapabilities,
  type ToolExecutionApi,
} from "@panticonic/pi-durable";

/**
 * Request controls a one-shot turn may carry. The transcript itself carries the
 * system prompt, messages and tool declarations; these are the per-request knobs.
 *
 * `toolChoice` is a provider-native word: Pi's neutral choice knows only `auto`
 * and `none`, while forcing a tool call is `any` (Anthropic, Bedrock, Google) or
 * `required` (OpenAI family, Mistral). The owner maps its intent to the word for
 * the model's API. `reasoning` uses Pi's simplified surface, which cannot force a
 * tool call.
 */
export interface NativeModelHelperOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: ThinkingLevel;
  toolChoice?: ToolChoice | "any" | "required";
  samplingParams?: SamplingParams;
}
/** The task's definition name, also how native model evidence recognizes a one-shot turn. */
export const NATIVE_MODEL_HELPER_TASK = "vibestudio.model-helper";
type Input = {
  model: JsonRepresentation<Model<Api>>;
  options: JsonRepresentation<NativeModelHelperOptions>;
  /** Present for a scoring request: the finite replies to score instead of a reply to generate. */
  score?: { candidates: string[] };
  cutoff: EntryId;
  /** Owner-defined provenance of whoever asked for this turn; retained with the
   * task and copied into the native model evidence of its request. */
  attribution?: JsonValue;
};
type Checkpoint = { phase: "request" };
/** The settled task keeps only what accounting needs; the message itself is `HelperResult`. */
type Result = { stopReason: string; usage: JsonRepresentation<Usage> };

/**
 * Pi keeps every task record for the life of its Session and has no deletion for it,
 * but a document retires with its owner and drops its content. The transcript is the
 * bulk of a turn's input, so it lives in a task-scoped document that retires when the
 * task settles, and the reply lives in a session-scoped document its caller retires
 * once it has been delivered. Only small records outlive a turn.
 */
const HelperTranscript = defineDoc<{
  transcript: JsonRepresentation<ModelContext>;
}>({
  kind: "vibestudio.model-helper-transcript",
  version: 1,
  scope: "task",
  initial: () => ({ transcript: { messages: [] } }),
  checkpointWhen: () => true,
});
const HelperResult = defineDocFamily<
  {
    message: JsonRepresentation<AssistantMessage> | null;
    scores: JsonRepresentation<NativeDecisionScores> | null;
  },
  null
>({
  kind: "vibestudio.model-helper-result",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ message: null, scores: null }),
  checkpointWhen: () => true,
});

/** The Codex Responses API rejects `temperature`, and its Pi adapter omits `maxTokens`
 * from the request body, so the ceiling is written into the payload. */
const CODEX_RESPONSES = "openai-codex-responses";

/** One provider call, through Pi's native options (or its simplified surface when
 * `reasoning` is asked), with per-API handling of temperature and the token ceiling. */
export async function dispatchHelperTurn(
  models: Models,
  model: Model<Api>,
  context: ModelContext,
  capabilities: ModelRequestCapabilities,
  options: NativeModelHelperOptions,
  signal: AbortSignal,
): Promise<AssistantMessage> {
  const forced =
    options.toolChoice === "any" || options.toolChoice === "required";
  if (options.reasoning !== undefined && forced)
    throw new Error(
      "Reasoning effort cannot be combined with a forced tool call; ask for one or the other",
    );
  const codex = model.api === CODEX_RESPONSES;
  const common = {
    ...capabilities,
    ...(options.temperature === undefined || codex
      ? {}
      : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.samplingParams === undefined
      ? {}
      : { samplingParams: options.samplingParams }),
    ...(codex && options.maxTokens !== undefined
      ? {
          onPayload: async (payload: unknown, providerModel: Model<Api>) => {
            const observed = await capabilities.onPayload?.(
              payload,
              providerModel,
            );
            return {
              ...((observed ?? payload) as Record<string, unknown>),
              max_output_tokens: Math.max(options.maxTokens!, 16),
            };
          },
        }
      : {}),
    signal,
  };
  if (options.reasoning !== undefined)
    return models.completeSimple(model, context, {
      ...common,
      reasoning: options.reasoning,
      ...(options.toolChoice === undefined
        ? {}
        : { toolChoice: options.toolChoice as ToolChoice }),
    });
  return models.complete(model, context, {
    ...common,
    ...(options.toolChoice === undefined
      ? {}
      : { toolChoice: options.toolChoice }),
  } as Parameters<Models["complete"]>[2]);
}

type HelperReply =
  | { message: AssistantMessage; scores?: undefined }
  | { scores: NativeDecisionScores; message?: undefined };

/** Scoring consumes prompt tokens only, at no price (the scorer is a local or flat-rate backend). */
function scoringUsage(scores: NativeDecisionScores): JsonRepresentation<Usage> {
  const { input, output } = scores.usage;
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/** One-shot inference is an actual native task, using generation's request port. */
export const NativeModelHelperTask = defineTask<Input, Checkpoint, Result>({
  name: NATIVE_MODEL_HELPER_TASK,
  version: 1,
  initial: () => ({ phase: "request" }),
  phases: {
    request: async (current, runtime, context) => {
      const { model, options, cutoff, score } = current.input;
      const stored = await runtime.snapshot(
        HelperTranscript,
        runtime.taskId,
        context,
      );
      if (!stored)
        throw new Error("Model helper lost its transcript document");
      const transcript = stored.transcript;
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
            ...(options.reasoning === undefined
              ? {}
              : { reasoning: options.reasoning }),
          },
        },
        async (
          capabilities,
          signal,
          prepared,
        ): Promise<HelperReply> => {
          const prompt = { ...transcript, messages: prepared.messages };
          if (!score)
            return {
              message: await dispatchHelperTurn(
                runtime.models,
                prepared.model,
                prompt,
                capabilities,
                options,
                signal,
              ),
            };
          // Scoring reads the model server's own log-probabilities through the
          // invocation's protected, endpoint-bound fetch: loopback or credential
          // authorization is injected at host egress. A model without such a
          // transport has no scoring backend.
          if (!capabilities.fetch)
            throw new DecisionUnsupportedError(
              "this model has no scoring backend",
            );
          return {
            scores: await scoreReplies({
              fetcher: capabilities.fetch,
              baseUrl: prepared.model.baseUrl,
              model: prepared.model.id,
              messages: openAIChatMessages(prompt),
              candidates: score.candidates,
              signal,
            }),
          };
        },
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
      const reply = response.result;
      if (
        reply.message &&
        (reply.message.stopReason === "error" ||
          reply.message.stopReason === "aborted")
      ) {
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: {
              status: "failed",
              error: {
                message:
                  reply.message!.errorMessage ||
                  `Model request ${reply.message!.stopReason}`,
                detail: { stopReason: reply.message!.stopReason },
              },
            },
          }),
          context,
        );
        return;
      }
      await runtime.commit(async (tx) => {
        const stored = await tx.doc(HelperResult, String(runtime.taskId), null);
        if (reply.message) {
          stored.message = copyJson(reply.message, {
            omitUndefinedProperties: true,
          }) as JsonRepresentation<AssistantMessage>;
        } else
          stored.scores = copyJson(reply.scores!) as JsonRepresentation<NativeDecisionScores>;
        const usage = reply.message
          ? (copyJson(reply.message.usage, {
              omitUndefinedProperties: true,
            }) as JsonRepresentation<Usage>)
          : scoringUsage(reply.scores!);
        return {
          status: "terminal",
          outcome: {
            status: "completed",
            result: {
              stopReason: reply.message?.stopReason ?? "stop",
              usage,
            },
          },
        };
      }, context);
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
  options: NativeModelHelperOptions,
  context: Context,
  parent?: ToolExecutionApi,
  attribution?: JsonValue,
): Promise<AssistantMessage> {
  const reply = await runNativeModelHelper(
    harness,
    conversation,
    selected,
    transcript,
    options,
    undefined,
    context,
    parent,
    attribution,
  );
  if (!reply.message)
    throw new Error("Completed model helper lost its reply document");
  return reply.message;
}

/**
 * Score finite replies with the model's own log-probabilities, as the same native
 * task through the same protected request port. A model whose backend cannot score
 * fails with a `decision-unsupported` message.
 */
export async function scoreNativeModelHelper(
  harness: Harness,
  conversation: Conversation,
  selected: Model<Api>,
  transcript: ModelContext,
  candidates: readonly string[],
  context: Context,
  parent?: ToolExecutionApi,
  attribution?: JsonValue,
): Promise<NativeDecisionScores> {
  const reply = await runNativeModelHelper(
    harness,
    conversation,
    selected,
    transcript,
    {},
    { candidates: [...candidates] },
    context,
    parent,
    attribution,
  );
  if (!reply.scores)
    throw new Error("Completed scoring helper lost its scores document");
  return reply.scores;
}

async function runNativeModelHelper(
  harness: Harness,
  conversation: Conversation,
  selected: Model<Api>,
  transcript: ModelContext,
  options: NativeModelHelperOptions,
  score: { candidates: string[] } | undefined,
  context: Context,
  parent: ToolExecutionApi | undefined,
  attribution: JsonValue | undefined,
): Promise<{
  message?: AssistantMessage;
  scores?: NativeDecisionScores;
}> {
  context.abortSignal?.throwIfAborted();
  // Admission completes without caller cancellation so a racing abort cannot
  // strand a committed task whose ID the caller never received.
  const taskId = await conversation.commit(async (tx) => {
    const marker = await tx.appendEntry(conversation.id, {
      kind: "vibestudio.model-helper-request",
    });
    const id = await tx.createTask(
      NativeModelHelperTask,
      {
        model: copyJson(selected, {
          omitUndefinedProperties: true,
        }) as Input["model"],
        options: copyJson(options, {
          omitUndefinedProperties: true,
        }) as Input["options"],
        ...(score ? { score } : {}),
        cutoff: marker.id,
        ...(attribution === undefined
          ? {}
          : { attribution: copyJson(attribution) }),
      },
      {
        ownership: parent
          ? { kind: "task", taskId: parent.taskId }
          : { kind: "conversation" },
        background: parent === undefined,
        abandonOnRestart: true,
      },
    );
    (await tx.doc(HelperTranscript, id)).transcript = copyJson(transcript, {
      omitUndefinedProperties: true,
    }) as JsonRepresentation<ModelContext>;
    return id;
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
    const reply = await harness.snapshot(
      HelperResult,
      String(taskId),
      BACKGROUND_CONTEXT,
    );
    if (!reply || (!reply.message && !reply.scores))
      throw new Error("Completed model helper lost its reply document");
    const delivered = {
      ...(reply.message
        ? { message: reply.message as AssistantMessage }
        : {}),
      ...(reply.scores
        ? { scores: reply.scores as NativeDecisionScores }
        : {}),
    };
    // Delivered: the reply document and its content leave storage with this commit.
    await harness.commit(
      (tx) => tx.retireDoc(HelperResult, String(taskId)),
      BACKGROUND_CONTEXT,
    );
    return delivered;
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
