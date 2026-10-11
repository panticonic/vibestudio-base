import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import {
  defineDocFamily,
  DirectToolCallEntry,
  NestedCallDoc,
  type TaskRecord,
  type EntryId,
  type Harness,
  type ModelRequestApi,
  type ModelRequestTarget,
  type TaskId,
  type ToolExecutionApi,
  type Tx,
} from "@panticonic/pi-durable";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  nativeInvocationId,
  nativeInvocationIdentity,
  nativeInvocationSourceSchema,
  type NativeInvocationInspection,
  type NativeInvocationIdentity,
  type NativeInvocationSource,
} from "@vibestudio/service-schemas/nativeInvocation";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  admittedAgentExecutor,
  type LoadedAgentImage,
} from "./native-agent-session.js";
import { nativeTaskProductContext } from "./native-product-context.js";
import { retainedNativeConversationChannel, retainedNativeChannelOriginatingInput } from "./native-channel-session.js";

const NativeSource = defineDocFamily<{ source: JsonValue }, null>({
  kind: "vibestudio.native-invocation-source",
  version: 1,
  scope: "task",
  family: true,
  initial: () => ({ source: null }),
  checkpointWhen: () => true,
});

export async function nativeInvocationOwner(
  harness: Harness,
  image: LoadedAgentImage,
  conversationId: import("@panticonic/pi-durable").ConversationId,
  context: Context,
): Promise<NativeInvocationSource["owner"]> {
  const executor = await admittedAgentExecutor(harness, image, context);
  const binding = await retainedNativeConversationChannel(harness, conversationId, context);
  return {
    ...executor.owner,
    channelId: binding.channelId,
    source: executor.source,
    effectiveVersion: executor.effectiveVersion,
    className: executor.className,
    objectKey: executor.objectKey,
    executionDigest: executor.executionDigest,
  };
}


/** Executable replacement preserves the original task attribution and intent.
 * Current execution is independently admitted against its loaded image. */
function nativeTaskIntent(source: NativeInvocationSource): string {
  const { incarnation: _incarnation, effectiveVersion: _version, executionDigest: _digest, channelId: _channel, ...owner } = source.owner;
  return canonicalJson({ owner, task: source.task, operation: source.operation });
}

async function retain(
  tx: Tx,
  source: NativeInvocationSource,
): Promise<NativeInvocationSource> {
  const checked = nativeInvocationSourceSchema.parse(source);
  const id = nativeInvocationId(checked);
  const retained = await tx.doc(
    NativeSource,
    checked.task.taskId as TaskId,
    id,
    null,
  );
  if (retained.source !== null) {
    const original = nativeInvocationSourceSchema.parse(retained.source);
    if (nativeTaskIntent(original) !== nativeTaskIntent(checked))
      throw new Error("Native invocation conflicts with its immutable source");
    return original;
  }
  retained.source = copyJson(checked);
  return checked;
}

/** Pin attribution through the actual scheduler request capability before publishing or calling a receiver. */
export async function retainNativeModelInvocation(
  harness: Harness,
  request: ModelRequestTarget,
  api: ModelRequestApi,
  image: LoadedAgentImage,
  context: Context,
): Promise<NativeInvocationSource> {
  const owner = await nativeInvocationOwner(harness, image, request.conversationId, context);
  const {
    operation: _operation,
    options: _options,
    handle: _handle,
    ...intent
  } = request;
  const source = nativeInvocationSourceSchema.parse({
    owner,
    task: {
      taskId: request.taskId,
      conversationId: request.conversationId,
      kind: request.taskKind,
      version: request.taskVersion,
    },
    operation: {
      kind: "model",
      purpose: request.purpose,
      attempt: request.attempt,
      cutoff: request.cutoff,
      requestDigest: sha256HexSyncText(canonicalJson(intent)),
    },
  });
  return api.commit(async (tx) => {
    const task = await tx.task(request.taskId);
    if (
      !task ||
      task.state.status !== "running" ||
      task.conversationId !== request.conversationId ||
      task.kind !== request.taskKind ||
      task.version !== request.taskVersion
    )
      throw new Error("Native model source does not match the invoking task");
    return retain(tx, source);
  }, context);
}

/** Coordinates of the committed tool task, never supplied by a tool caller. */
export function nativeToolInvocationCoordinates(
  task: TaskRecord<JsonValue, JsonValue, unknown>,
): Exclude<NativeInvocationIdentity["operation"], { kind: "model" }> {
  const input = task.input;
  if (task.kind !== "pi.tool" || !isObject(input))
    throw new Error("Native tool authority has no original call identity");
  if (input["kind"] === "nested") {
    const call = input["call"];
    if (!isObject(call) || typeof call["id"] !== "string" || !call["id"] ||
      typeof input["parent"] !== "number" || task.owner !== input["parent"] ||
      typeof input["parentCallId"] !== "string" || !input["parentCallId"] ||
      typeof input["key"] !== "string" || !input["key"])
      throw new Error("Nested native tool has no committed parent call");
    return { kind: "nested-tool", parentTaskId: input["parent"], parentCallId: input["parentCallId"], key: input["key"], callId: call["id"] };
  }
  if (typeof input["callId"] !== "string" || !input["callId"])
    throw new Error("Native tool authority has no original call identity");
  if (input["kind"] === "model" && typeof input["assistant"] === "number")
    return { kind: "tool", assistantEntryId: input["assistant"], callId: input["callId"] };
  if (input["kind"] === "direct" && typeof input["entryId"] === "number")
    return { kind: "direct-tool", directEntryId: input["entryId"], callId: input["callId"] };
  throw new Error("Native tool authority has no original call identity");
}

/** Derive attribution from the real assistant or direct call and final native execution intent. */
export async function retainNativeToolInvocation(
  harness: Harness,
  api: ToolExecutionApi,
  image: LoadedAgentImage,
  context: Context,
): Promise<NativeInvocationSource> {
  const owner = await nativeInvocationOwner(harness, image, api.conversationId, context);
  return api.commit(async (tx) => {
    const task = await tx.task(api.taskId);
    if (
      !task ||
      task.kind !== "pi.tool" ||
      task.conversationId !== api.conversationId ||
      task.state.status !== "running" ||
      !isObject(task.input) ||

      !isObject(task.state.checkpoint) ||
      task.state.checkpoint["phase"] !== "execute"
    )
      throw new Error(
        "Native tool source does not match its committed invocation",
      );
    const coordinates = nativeToolInvocationCoordinates(task);
    if (coordinates.callId !== api.callId)
      throw new Error("Native tool call conflicts with its invoking task");
    if (coordinates.kind === "nested-tool") {
      const parent = await tx.task(coordinates.parentTaskId as TaskId);
      const retained = await tx.doc(NestedCallDoc, coordinates.parentTaskId as TaskId, coordinates.key, null);
      const call = task.input["call"];
      if (!parent || parent.conversationId !== task.conversationId ||
        nativeToolInvocationCoordinates(parent).callId !== coordinates.parentCallId ||
        retained.taskId !== task.id || !isObject(call) || typeof call["name"] !== "string" || !call["name"])
        throw new Error("Nested native tool does not belong to its retained parent call");
      return retain(tx, {
        owner,
        task: { taskId: task.id, conversationId: task.conversationId, kind: task.kind, version: task.version },
        operation: { ...coordinates, name: call["name"], argumentsDigest: sha256HexSyncText(canonicalJson(task.state.checkpoint["arguments"])) },
      });
    }
    const direct = task.input["kind"] === "direct";
    const entry = await tx.entry(task.input[direct ? "entryId" : "assistant"] as EntryId);
    if (direct) {
      const source =
        entry && DirectToolCallEntry.is(entry) ? entry.data?.call : undefined;
      if (
        !entry ||
        entry.model !== undefined ||
        !source ||
        source.id !== api.callId
      )
        throw new Error(
          "Native direct tool source has no exact committed direct call",
        );
      return retain(tx, {
        owner,
        task: {
          taskId: task.id,
          conversationId: task.conversationId,
          kind: task.kind,
          version: task.version,
        },
        operation: {
          kind: "direct-tool",
          directEntryId: entry.id,
          callId: api.callId,
          name: source.name,
          argumentsDigest: sha256HexSyncText(
            canonicalJson(task.state.checkpoint["arguments"]),
          ),
        },
      });
    }
    const calls =
      entry?.model?.flatMap((message) =>
        message.role === "assistant" ? message.content : [],
      ) ?? [];
    const matching = calls.filter(
      (content) => content.type === "toolCall" && content.id === api.callId,
    );
    const modelCall = matching[0];
    if (!entry || matching.length !== 1 || modelCall?.type !== "toolCall")
      throw new Error(
        "Native tool source has no exact committed assistant call",
      );
    return retain(tx, {
      owner,
      task: {
        taskId: task.id,
        conversationId: task.conversationId,
        kind: task.kind,
        version: task.version,
      },
      operation: {
        kind: "tool",
        assistantEntryId: entry.id,
        callId: api.callId,
        name: modelCall.name,
        argumentsDigest: sha256HexSyncText(
          canonicalJson(task.state.checkpoint["arguments"]),
        ),
      },
    });
  }, context);
}

/** Resolve source from its actual task-owned document and current owner. */
async function readNativeTaskSource(
  harness: Harness,
  input: { taskId: number; invocationId: string },
  owner: NativeInvocationSource["owner"],
  context: Context,
) {
  const task = await harness.getTask(input.taskId as TaskId, context);
  if (!task) return null;
  const retained = await harness.snapshot(
    NativeSource,
    task.id,
    input.invocationId,
    context,
  );
  if (!retained || retained.source === null) return null;
  const source = nativeInvocationSourceSchema.parse(retained.source);
  if (
    nativeInvocationId(source) !== input.invocationId ||
    source.owner.runtimeId !== owner.runtimeId ||
    source.owner.authoritySessionId !== owner.authoritySessionId ||
    source.owner.contextId !== owner.contextId ||
    source.owner.source !== owner.source ||
    source.owner.className !== owner.className ||
    source.owner.objectKey !== owner.objectKey ||
    source.task.taskId !== task.id ||
    source.task.conversationId !== task.conversationId ||
    source.task.kind !== task.kind ||
    source.task.version !== task.version
  )
    throw new Error(
      "Native invocation belongs to a different task, owner, lifetime or image",
    );
  return { source, task };
}

export async function readRetainedNativeInvocationSource(
  harness: Harness,
  input: { taskId: number; invocationId: string },
  image: LoadedAgentImage,
  context: Context,
): Promise<NativeInvocationSource | null> {
  const task = await harness.getTask(input.taskId as TaskId, context);
  if (!task) return null;
  const executor = await nativeInvocationOwner(harness, image, task.conversationId, context);
  return (await readNativeTaskSource(harness, input, executor, context))?.source ?? null;
}

/** Host inspection reads the exact current task and admitted image. */
export async function inspectNativeInvocationSource(
  harness: Harness,
  input: { taskId: number; invocationId: string },
  image: LoadedAgentImage,
  context: Context,
): Promise<NativeInvocationInspection | null> {
  const actual = await harness.getTask(input.taskId as TaskId, context);
  if (!actual) return null;
  const owner = await nativeInvocationOwner(harness, image, actual.conversationId, context);
  const original = await readNativeTaskSource(harness, input, owner, context);
  if (!original || original.task.state.status === "terminal" || original.task.state.status === "completing") return null;
  const { source, task } = original;
  if (!isObject(task.state.checkpoint))
    throw new Error("Native invocation has no committed execution intent");
  if (source.operation.kind !== "model") {
    if (
      !isObject(task.input) ||
      canonicalJson(nativeToolInvocationCoordinates(task)) !== canonicalJson(nativeInvocationIdentity(source).operation) ||
      task.state.checkpoint["phase"] !== "execute" ||
      sha256HexSyncText(canonicalJson(task.state.checkpoint["arguments"])) !==
        source.operation.argumentsDigest
    )
      throw new Error(
        "Native tool invocation conflicts with its committed execution intent",
      );
  } else {
    const checkpoint = task.state.checkpoint;
    const generation =
      source.operation.purpose === "generation" &&
      task.kind === "pi.generation" &&
      (checkpoint["phase"] === "request" || checkpoint["phase"] === "poll") &&
      checkpoint["cutoff"] === source.operation.cutoff;
    const compaction =
      source.operation.purpose === "compaction" &&
      task.kind === "pi.compaction" &&
      checkpoint["phase"] === "summarize" &&
      checkpoint["tail"] === source.operation.cutoff;
    if (
      (!generation && !compaction) ||
      checkpoint["attempt"] !== source.operation.attempt
    )
      return null;
  }
  // A durable abort requests cleanup; it does not declare the owned operation terminal.
  const originatingInput = await retainedNativeInvocationOriginatingInput(harness, task.id, context);
  return {
    source,
    executor: owner,
    status: task.state.status,
    abortRequested: task.abortRequested,
    originatingInput,
  };
}

/** The placed input that actually owns this task, independent of transcript text. */
export async function retainedNativeInvocationOriginatingInput(
  harness: Harness, taskId: TaskId, context: Context,
): Promise<NativeInvocationInspection["originatingInput"]> {
  const product = await nativeTaskProductContext(harness, taskId, context);
  const original = product?.inputs[0];
  return original === undefined ? null
    : retainedNativeChannelOriginatingInput(harness, original, context);
}

function isObject(
  value: JsonValue | undefined,
): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
