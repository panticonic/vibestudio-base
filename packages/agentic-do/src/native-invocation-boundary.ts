import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  defineDoc,
  type JsonObject,
  type Harness,
  type ModelRequestApi,
  type ModelRequestTarget,
  type TaskId,
  type TaskRecord,
  type ToolExecutionApi,
  type Tx,
} from "@panticonic/pi-durable";
import {
  withCausalParent,
  withRpcAbortSignal,
  type RpcClient,
} from "@vibestudio/rpc";
import {
  nativeInvocationId,
  nativeInvocationSourceSchema,
  nativeOriginatingInputSchema,
  type NativeOriginatingInput,
  type NativeInvocationSource,
} from "@vibestudio/service-schemas/nativeInvocation";
import {
  channelTrajectoryFor,
  commandIdForTrajectoryInvocation,
} from "@vibestudio/trajectory-identity";
import {
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import type {
  AgentHostCall,
  LoadedAgentImage,
} from "./native-agent-session.js";
import {
  retainNativeModelInvocation,
  retainNativeToolInvocation,
  retainedNativeInvocationOriginatingInput,
} from "./native-invocation-source.js";

/** Only publication obligations live here. Pi's actual task remains the execution truth. */
interface InvocationPublication extends JsonObject {
  taskId: TaskId;
  invocationId: string;
  source: JsonValue;
  request: JsonValue | null;
  originatingInput: JsonValue | null;
  createdAt: string;
  startedEventSequence: number | null;
}
const InvocationPublications = defineDoc<{ pending: InvocationPublication[] }>({
  kind: "vibestudio.native-invocation-publications",
  version: 2,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ pending: [] }),
  checkpointWhen: () => true,
});

export interface NativeInvocationBoundary {
  readonly harness: Harness;
  readonly image: LoadedAgentImage;
  readonly callHost: AgentHostCall;
  readonly rpc: RpcClient;
  /** Must use the supplied immutable idempotency key at the canonical channel receiver. */
  readonly publishStart: (
    channelId: string,
    event: AgenticEvent<"invocation.started">,
    idempotencyKey: string,
    context: Context,
  ) => Promise<{ id?: number }>;
}

import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";

export interface NativeInvocationExecution {
  readonly metadata?: AgentProductMetadata;
  readonly invocationId: string;
  readonly commandId: string;
  readonly rpc: RpcClient;
}

type CommitPort = Pick<ToolExecutionApi, "commit">;

function startEvent(
  source: NativeInvocationSource,
  invocationId: string,
  createdAt: string,
  request: JsonValue | null,
  originatingInput: NativeOriginatingInput | null,
): AgenticEvent<"invocation.started"> {
  return {
    kind: "invocation.started",
    actor: {
      kind: "agent",
      id: source.owner.runtimeId,
      participantId: source.owner.runtimeId,
    },
    causality: { invocationId: invocationId as never },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      name:
        source.operation.kind !== "model"
          ? source.operation.name
          : `model.${source.operation.purpose}`,
      invocationType: source.operation.kind !== "model" ? "tool" : "system",
      nativeSource: source,
      originatingInput,
      ...(source.operation.kind === "model"
        ? {}
        : { request: copyJson(request) }),
    },
    createdAt,
  };
}

/** Admission precedes publication, and canonical publication precedes protected execution. */
async function openInvocation(
  boundary: NativeInvocationBoundary,
  source: NativeInvocationSource,
  api: CommitPort,
  context: Context,
): Promise<NativeInvocationExecution> {
  const invocationId = nativeInvocationId(source);
  const originatingInput = await retainedNativeInvocationOriginatingInput(
    boundary.harness, source.task.taskId as TaskId, context,
  );
  const publication = await api.commit(async (tx) => {
    const task = await tx.task(source.task.taskId as TaskId);
    if (
      !task ||
      task.state.status !== "running" ||
      task.conversationId !== source.task.conversationId ||
      task.kind !== source.task.kind ||
      task.version !== source.task.version
    )
      throw new Error(
        "Native invocation publication has no actual running owner",
      );
    // Publish the committed execution arguments, independent of later source
    // or registry changes. The digest remains the authority binding.
    let request: JsonValue | null = null;
    if (source.operation.kind !== "model") {
      const checkpoint = task.state.checkpoint;
      if (
        !checkpoint ||
        typeof checkpoint !== "object" ||
        Array.isArray(checkpoint) ||
        checkpoint["phase"] !== "execute" ||
        !checkpoint["arguments"] ||
        typeof checkpoint["arguments"] !== "object" ||
        Array.isArray(checkpoint["arguments"]) ||
        sha256HexSyncText(canonicalJson(checkpoint["arguments"])) !==
          source.operation.argumentsDigest
      )
        throw new Error(
          "Native invocation request does not match its committed arguments",
        );
      request = copyJson(checkpoint["arguments"]);
    }
    const publications = await tx.doc(
      InvocationPublications,
      task.conversationId,
    );
    const retained = publications.pending.find(
      (item) => item.invocationId === invocationId,
    );
    if (retained) {
      if (retained.taskId !== task.id)
        throw new Error("Native invocation publication changed its owner");
      return { ...retained, source: copyJson(retained.source) };
    }
    const candidate = {
      taskId: task.id,
      invocationId,
      source: copyJson(source),
      request,
      originatingInput: copyJson(originatingInput),
      createdAt: new Date().toISOString(),
      startedEventSequence: null,
    };
    publications.pending.push(candidate);
    return candidate;
  }, context);
  if (publication.startedEventSequence === null) {
    const accepted = await boundary.publishStart(
      source.owner.channelId,
      startEvent(
        source,
        invocationId,
        publication.createdAt,
        publication.request,
        publication.originatingInput === null ? null : nativeOriginatingInputSchema.parse(publication.originatingInput),
      ),
      `${invocationId}:started`,
      context,
    );
    if (!Number.isSafeInteger(accepted.id) || (accepted.id ?? -1) < 0)
      throw new Error(
        "Native invocation start lacks canonical channel acceptance",
      );
    await api.commit(async (tx) => {
      const publications = await tx.doc(
        InvocationPublications,
        source.task.conversationId as ToolExecutionApi["conversationId"],
      );
      const retained = publications.pending.find(
        (item) => item.invocationId === invocationId,
      );
      if (!retained || retained.taskId !== source.task.taskId)
        throw new Error("Native invocation lost its publication obligation");
      if (
        retained.startedEventSequence !== null &&
        retained.startedEventSequence !== accepted.id
      )
        throw new Error(
          "Native invocation start changed its canonical acceptance",
        );
      retained.startedEventSequence = accepted.id!;
    }, context);
  }
  context.abortSignal?.throwIfAborted();
  if (!context.abortSignal)
    throw new Error("Native invocation requires its owned cancellation signal");
  const trajectory = channelTrajectoryFor(source.owner.channelId);
  return Object.freeze({
    invocationId,
    commandId: commandIdForTrajectoryInvocation({
      ...trajectory,
      invocationId,
    }),
    rpc: withRpcAbortSignal(
      withCausalParent(boundary.rpc, {
        kind: "trajectory-invocation",
        logId: trajectory.logId,
        head: trajectory.head,
        invocationId,
      }),
      context.abortSignal,
    ),
  });
}

export async function bindNativeToolInvocation(
  boundary: NativeInvocationBoundary,
  api: ToolExecutionApi,
  context: Context,
): Promise<NativeInvocationExecution> {
  const source = await retainNativeToolInvocation(
    boundary.harness,
    api,
    boundary.image,
    boundary.callHost,
    context,
  );
  return openInvocation(boundary, source, api, context);
}

export async function bindNativeModelInvocation(
  boundary: NativeInvocationBoundary,
  request: ModelRequestTarget,
  api: ModelRequestApi,
  context: Context,
): Promise<NativeInvocationExecution> {
  const source = await retainNativeModelInvocation(
    boundary.harness,
    request,
    api,
    boundary.image,
    boundary.callHost,
    context,
  );
  return openInvocation(boundary, source, api, context);
}

export interface NativeInvocationTerminalPublication {
  readonly source: NativeInvocationSource;
  readonly start: AgenticEvent<"invocation.started">;
  readonly startIdempotencyKey: string;
  readonly terminalIdempotencyKey: string;
  readonly outcome: Extract<
    TaskRecord<JsonValue, JsonValue, JsonValue>["state"],
    { status: "terminal" }
  >["outcome"];
}

/**
 * Called from the native transactional preparation hook. The consumer creates
 * its native publication task in this same Tx; only then is the obligation
 * removed. A crash can lose neither the outcome nor its channel delivery.
 */
export async function prepareNativeInvocationTerminals(
  tx: Tx,
  tasks: readonly TaskRecord<JsonValue, JsonValue, JsonValue>[],
  enqueue: (
    tx: Tx,
    publication: NativeInvocationTerminalPublication,
  ) => Promise<void>,
): Promise<void> {
  for (const task of tasks) {
    if (task.state.status !== "terminal") continue;
    const publications = await tx.doc(
      InvocationPublications,
      task.conversationId,
    );
    const owned = publications.pending.filter(
      (item) => item.taskId === task.id,
    );
    for (const publication of owned) {
      const source = nativeInvocationSourceSchema.parse(publication.source);
      await enqueue(tx, {
        source,
        start: startEvent(
          source,
          publication.invocationId,
          publication.createdAt,
          publication.request,
          publication.originatingInput === null ? null : nativeOriginatingInputSchema.parse(publication.originatingInput),
        ),
        startIdempotencyKey: `${publication.invocationId}:started`,
        terminalIdempotencyKey: `${publication.invocationId}:terminal`,
        outcome: task.state.outcome,
      });
    }
    publications.pending = publications.pending.filter(
      (item) => item.taskId !== task.id,
    );
  }
}
