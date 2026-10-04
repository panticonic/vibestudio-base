import { type Context, type JsonRepresentation } from "@panticonic/pi-chord";
import type { Api, Model, Usage } from "@panticonic/pi-ai";
import {
  AssistantEntry,
  defineDoc,
  LiveDoc,
  UsageDoc,
  type ConversationId,
  type EntryId,
  type Harness,
  type HarnessCommit,
  type ModelRequestApi,
  type ModelRequestConnection,
  type ModelRequestTarget,
  type TaskId,
  type Tx,
} from "@panticonic/pi-durable";

import { nativeTaskProductContext } from "./native-product-context.js";

const RETAINED_ATTEMPTS = 100;
type ModelRoute = {
  provider: string;
  model: string;
  ref: string;
  api: string;
  baseUrl: string;
};
export type NativeModelAttempt = ModelRoute & {
  attemptId: number;
  native: {
    conversationId: ConversationId;
    taskId: TaskId;
    purpose: string;
    attempt: number;
    cutoff: EntryId;
  };
  original: ModelRoute;
  operation: "stream" | "complete";
  auth: "api_key" | "oauth" | "none";
  startedAt: string;
  completedAt?: string;
  entryId?: EntryId;
  outcome?: "completed" | "failed" | "aborted";
  usage?: JsonRepresentation<Usage>;
  error?: string;
};
const ModelEvidence = defineDoc<{
  totalCalls: number;
  calls: NativeModelAttempt[];
}>({
  kind: "vibestudio.native-model-evidence",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ totalCalls: 0, calls: [] }),
  checkpointWhen: () => true,
});

function route(
  model: Pick<Model<Api>, "provider" | "id" | "api" | "baseUrl">,
): ModelRoute {
  // Endpoint evidence never carries URL credentials or query parameters.
  const endpoint = new URL(model.baseUrl);
  endpoint.username = "";
  endpoint.password = "";
  endpoint.search = "";
  endpoint.hash = "";
  return {
    provider: model.provider,
    model: model.id,
    ref: `${model.provider}:${model.id}`,
    api: model.api,
    baseUrl: endpoint.toString(),
  };
}

/** Observe actual provider payload dispatch, after existing payload preparation succeeds. */
export async function observeNativeModelConnection(
  request: ModelRequestTarget,
  api: ModelRequestApi,
  connection: ModelRequestConnection,
  context: Context,
): Promise<ModelRequestConnection> {
  if (request.operation !== "stream" && request.operation !== "complete")
    return connection;
  const operation = request.operation;
  const existing = connection.options.onPayload;
  return {
    ...connection,
    options: {
      ...connection.options,
      onPayload: async (payload, model) => {
        const transformed = await existing?.(payload, model);
        const effective = api.prepared ?? request;
        const actual = route(model);
        const expected = route(effective.model);
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error(
            "Native model dispatch changed its prepared endpoint",
          );
        await api.commit(async (tx) => {
          const evidence = await tx.doc(ModelEvidence, request.conversationId);
          evidence.totalCalls++;
          evidence.calls.push({
            attemptId: evidence.totalCalls,
            ...actual,
            native: {
              conversationId: request.conversationId,
              taskId: request.taskId,
              purpose: request.purpose,
              attempt: request.attempt,
              cutoff: request.cutoff,
            },
            original: route(request.model),
            operation,
            auth:
              connection.options.authType ??
              (connection.options.apiKey ? "api_key" : "none"),
            startedAt: new Date().toISOString(),
          });
          if (evidence.calls.length > RETAINED_ATTEMPTS)
            evidence.calls.splice(0, evidence.calls.length - RETAINED_ATTEMPTS);
        }, context);
        return transformed;
      },
    },
  };
}

/** Provider entries and task outcomes remain observations in their original native batch. */
export async function prepareNativeModelEvidence(
  tx: Tx,
  staged: HarnessCommit,
  _context: Context,
): Promise<void> {
  for (const entry of staged.entries) {
    if (!AssistantEntry.is(entry) || entry.byTaskId === undefined) continue;
    const message = entry.model?.find(
      (message) => message.role === "assistant",
    );
    if (!message || message.role !== "assistant") continue;
    const evidence = await tx.doc(ModelEvidence, entry.conversationId);
    const call = [...evidence.calls]
      .reverse()
      .find(
        (call) =>
          call.native.taskId === entry.byTaskId &&
          call.native.purpose === "generation" &&
          call.outcome === undefined,
      );
    if (!call) continue;
    call.entryId = entry.id;
    call.completedAt = new Date().toISOString();
    call.outcome =
      message.stopReason === "error"
        ? "failed"
        : message.stopReason === "aborted"
          ? "aborted"
          : "completed";
    const usage = message.usage;
    call.usage = {
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      totalTokens: usage.totalTokens,
      ...(usage.cacheWrite1h === undefined
        ? {}
        : { cacheWrite1h: usage.cacheWrite1h }),
      ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
      cost: {
        input: usage.cost.input,
        output: usage.cost.output,
        cacheRead: usage.cost.cacheRead,
        cacheWrite: usage.cost.cacheWrite,
        total: usage.cost.total,
      },
    };
    if (message.errorMessage !== undefined) call.error = message.errorMessage;
  }
  for (const task of staged.tasks) {
    if (task.state.status !== "terminal" && task.state.status !== "completing")
      continue;
    const evidence = await tx.doc(ModelEvidence, task.conversationId);
    const call = [...evidence.calls]
      .reverse()
      .find(
        (call) => call.native.taskId === task.id && call.outcome === undefined,
      );
    if (!call) continue;
    const outcome = task.state.outcome;
    if (outcome.status === "completed" && call.native.purpose === "generation")
      continue;
    call.completedAt = new Date().toISOString();
    call.outcome =
      outcome.status === "completed"
        ? "completed"
        : outcome.status === "aborted"
          ? "aborted"
          : "failed";
    if ("error" in outcome && outcome.error) call.error = outcome.error.message;
  }
}

/** Read current native facts; missing state is an error rather than an idle projection. */
export async function readNativeChannelInspection(
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
) {
  if (!(await harness.conversation(conversationId, context)))
    throw new Error("Native inspection has no conversation");
  const inspection = await harness.inspect(context);
  const live = await harness.snapshot(LiveDoc, conversationId, context);
  const usage = await harness.snapshot(UsageDoc, conversationId, context);
  if (!live || !usage)
    throw new Error("Native inspection lost initialized conversation state");
  return {
    conversationId,
    scheduling: inspection.scheduling,
    tasks: inspection.tasks.filter(
      (task) => task.record.conversationId === conversationId,
    ),
    submissions: inspection.submissions.filter(
      (submission) => submission.conversationId === conversationId,
    ),
    live,
    usage,
  };
}

export async function readNativeModelExecutionEvidence(
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
) {
  const inspection = await readNativeChannelInspection(
    harness,
    conversationId,
    context,
  );
  const evidence = await harness.snapshot(
    ModelEvidence,
    conversationId,
    context,
  );
  const calls = await Promise.all(
    (evidence?.calls ?? []).map(async (call) => {
      const task = await harness.getTask(call.native.taskId, context);
      if (!task || task.conversationId !== conversationId)
        throw new Error("Native model evidence lost its actual execution task");
      const product = await nativeTaskProductContext(
        harness,
        call.native.taskId,
        context,
      );
      const inputs = product?.inputs.length
        ? await Promise.all(
            product.inputs.map(async (id) => {
              const submission = await harness.submission(id, context);
              if (!submission)
                throw new Error(
                  "Native model evidence lost an original admitted input",
                );
              const record = await submission.status(context);
              if (
                record.conversationId !== conversationId ||
                record.type !== "input"
              )
                throw new Error(
                  "Native model evidence changed its actual input lineage",
                );
              return record;
            }),
          )
        : [];
      return {
        ...call,
        inputs,
        task: {
          status: task.state.status,
          ...(task.state.status === "terminal" ||
          task.state.status === "completing"
            ? { outcome: task.state.outcome.status }
            : {}),
        },
      };
    }),
  );
  return {
    conversationId,
    totalCalls: evidence?.totalCalls ?? 0,
    truncated: (evidence?.totalCalls ?? 0) > calls.length,
    calls,
    usage: inspection.usage,
  };
}
