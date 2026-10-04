import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import {
  defineDocFamily,
  DirectToolCallEntry,
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
  nativeInvocationSourceSchema,
  type NativeInvocationInspection,
  type NativeInvocationSource,
} from "@vibestudio/service-schemas/nativeInvocation";
import { workspaceStateMethods } from "@vibestudio/service-schemas/workspaceState";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  retainedAgentExecutionOwner,
  type AgentHostCall,
  type LoadedAgentImage,
} from "./native-agent-session.js";
import { nativeTaskProductContext } from "./native-product-context.js";
import { retainedNativeChannelOriginatingInput } from "./native-channel-session.js";

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
  call: AgentHostCall,
  context: Context,
): Promise<NativeInvocationSource["owner"]> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  const entity = workspaceStateMethods["entity.resolveActive"].returns.parse(
    await call<unknown>("workspace-state.entity.resolveActive", [
      image.runtimeId,
    ]),
  );
  if (
    !entity ||
    entity.kind !== "do" ||
    entity.status !== "active" ||
    entity.id !== image.runtimeId ||
    owner.runtimeId !== image.runtimeId ||
    entity.authoritySessionId !== owner.authoritySessionId ||
    entity.contextId !== owner.contextId ||
    entity.source.repoPath !== image.source ||
    entity.className !== image.className ||
    entity.key !== image.objectKey ||
    entity.activeExecutionDigest !== image.executionDigest ||
    entity.agentBinding?.entityId !== image.runtimeId ||
    entity.agentBinding.contextId !== owner.contextId
  )
    throw new Error(
      "Native invocation requires its current host-bound owner and image",
    );
  return {
    ...owner,
    channelId: entity.agentBinding.channelId,
    source: image.source,
    effectiveVersion: entity.source.effectiveVersion,
    className: image.className,
    objectKey: image.objectKey,
    executionDigest: image.executionDigest,
  };
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
  if (
    retained.source !== null &&
    canonicalJson(retained.source) !== canonicalJson(checked)
  )
    throw new Error("Native invocation conflicts with its immutable source");
  retained.source = copyJson(checked);
  return checked;
}

/** Pin attribution through the actual scheduler request capability before publishing or calling a receiver. */
export async function retainNativeModelInvocation(
  harness: Harness,
  request: ModelRequestTarget,
  api: ModelRequestApi,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<NativeInvocationSource> {
  const owner = await nativeInvocationOwner(harness, image, call, context);
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

/** Derive attribution from the real assistant or direct call and final native execution intent. */
export async function retainNativeToolInvocation(
  harness: Harness,
  api: ToolExecutionApi,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<NativeInvocationSource> {
  const owner = await nativeInvocationOwner(harness, image, call, context);
  return api.commit(async (tx) => {
    const task = await tx.task(api.taskId);
    if (
      !task ||
      task.kind !== "pi.tool" ||
      task.conversationId !== api.conversationId ||
      task.state.status !== "running" ||
      !isObject(task.input) ||
      task.input["callId"] !== api.callId ||
      !isObject(task.input["source"]) ||
      (task.input["source"]["kind"] !== "assistant" &&
        task.input["source"]["kind"] !== "direct") ||
      typeof task.input["source"]["entryId"] !== "number" ||
      !isObject(task.state.checkpoint) ||
      task.state.checkpoint["phase"] !== "execute"
    )
      throw new Error(
        "Native tool source does not match its committed invocation",
      );
    const entry = await tx.entry(task.input["source"]["entryId"] as EntryId);
    const direct = task.input["source"]["kind"] === "direct";
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

/** Host inspection reads a real retained source and its current owning task; it creates no admission. */
export async function inspectNativeInvocationSource(
  harness: Harness,
  input: { taskId: number; invocationId: string },
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<NativeInvocationInspection | null> {
  const owner = await nativeInvocationOwner(harness, image, call, context);
  const task = await harness.getTask(input.taskId as TaskId, context);
  if (
    !task ||
    task.state.status === "terminal" ||
    task.state.status === "completing"
  )
    return null;
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
    canonicalJson(owner) !== canonicalJson(source.owner) ||
    source.task.taskId !== task.id ||
    source.task.conversationId !== task.conversationId ||
    source.task.kind !== task.kind ||
    source.task.version !== task.version
  )
    throw new Error(
      "Native invocation belongs to a different task, owner, lifetime or image",
    );
  if (!isObject(task.state.checkpoint))
    throw new Error("Native invocation has no committed execution intent");
  if (source.operation.kind !== "model") {
    if (
      !isObject(task.input) ||
      task.input["callId"] !== source.operation.callId ||
      !isObject(task.input["source"]) ||
      task.input["source"]["kind"] !==
        (source.operation.kind === "tool" ? "assistant" : "direct") ||
      task.input["source"]["entryId"] !==
        (source.operation.kind === "tool"
          ? source.operation.assistantEntryId
          : source.operation.directEntryId) ||
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
