import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import {
  acceptReceipt,
  bindReceipt,
  defineDocFamily,
  ReceiptDoc,
  type Harness,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolExecutionWait,
  type Tx,
} from "@panticonic/pi-durable";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  eventKindSchemas,
  type ChannelMethodOriginalRequest,
} from "@workspace/agentic-protocol";
import type { ChannelClient } from "./channel-client.js";
import type { NativeInvocationExecution } from "./native-invocation-boundary.js";
import { nativeTaskProductContext } from "./native-product-context.js";
import { nativeTurnId } from "./native-turn-id.js";
import type { ChannelEvent } from "@workspace/pubsub";

export type NativeChannelMethodRequest = {
  channelId: string;
  callerId: string;
  /** One target for advertised methods; the captured human audience for ask_user. */
  targetIds: string[];
  method: string;
  args: JsonValue;
  /** The calling native turn; the executing participant attributes its output to it. */
  turnId?: string;
};
type ChannelMethodClient = Pick<
  ChannelClient,
  "callMethod" | "cancelCall" | "getEnvelope"
>;
export interface NativeChannelMethodHost {
  harness: () => Harness;
  bindExecution: (
    api: ToolExecutionApi,
    context: Context,
  ) => Promise<NativeInvocationExecution>;
  channelClient: (
    channelId: string,
    execution: NativeInvocationExecution,
  ) => ChannelMethodClient;
}
export type NativeChannelMethodOutcome = {
  protocol: "native-channel-method-outcome.v1";
  invocationId: string;
  transportCallId: string;
  /** Logical terminal identity is available before retention. */
  envelopeId: string;
  eventId: number;
  kind:
    | "invocation.completed"
    | "invocation.failed"
    | "invocation.cancelled"
    | "invocation.abandoned";
  value: JsonValue;
};
export type ChannelMethodCall = {
  targetId: string;
  invocationId: string;
  callId: string;
};
type MethodCall = ChannelMethodCall;
type CanonicalMethodRequest = Omit<NativeChannelMethodRequest, "args"> & {
  args: JsonValue | undefined;
  turnId?: string;
};

/** This is a routing hint, never result authority. Consumption rereads the
 * exact canonical route before accepting a native receipt. */
export function nativeChannelMethodReceiptKey(
  event: ChannelEvent,
): string | null {
  if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) return null;
  const id = (
    event.payload as { causality?: { invocationId?: unknown } } | null
  )?.causality?.invocationId;
  if (typeof id !== "string") return null;
  const match = /^(.+:channel-method):[a-f0-9]{64}$/.exec(id);
  return match?.[1] ?? null;
}
type MethodAdmissionData =
  {
    binding: string;
    taskId: number;
    conversationId: number;
    toolCallId: string;
    request: NativeChannelMethodRequest | null;
    calls: MethodCall[];
    winner: NativeChannelMethodOutcome | null;
  };
const MethodAdmission = defineDocFamily<MethodAdmissionData,
  null
>({
  kind: "vibestudio.channel-method-admission",
  version: 2,

  scope: "session",
  family: true,
  initial: () => ({
    binding: "",
    taskId: 0,
    conversationId: 0,
    toolCallId: "",
    request: null,
    calls: [],
    winner: null,
  }),
  checkpointWhen: () => true,
});

function validateRequest(
  value: NativeChannelMethodRequest,
): NativeChannelMethodRequest {
  const request = copyJson(value);
  if (!request || typeof request !== "object" || Array.isArray(request))
    throw new Error("Native channel method requires an object request");
  const channelId = request["channelId"],
    callerId = request["callerId"],
    method = request["method"],
    targetIds = request["targetIds"];
  if (
    typeof channelId !== "string" ||
    !channelId ||
    typeof callerId !== "string" ||
    !callerId ||
    typeof method !== "string" ||
    !method ||
    (request["turnId"] !== undefined &&
      (typeof request["turnId"] !== "string" || !request["turnId"])) ||
    !Array.isArray(targetIds) ||
    !targetIds.length ||
    !targetIds.every(
      (id): id is string => typeof id === "string" && id.length > 0,
    ) ||
    new Set(targetIds).size !== targetIds.length ||
    !("args" in request)
  )
    throw new Error(
      "Native channel method requires one immutable, nonempty audience",
    );
  return {
    channelId,
    callerId,
    method,
    targetIds: [...targetIds],
    args: request["args"]!,
    ...(typeof request["turnId"] === "string"
      ? { turnId: request["turnId"] }
      : {}),
  };
}
function validateOutcome(value: JsonValue): NativeChannelMethodOutcome {
  const outcome = copyJson(value);
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome))
    throw new Error(
      "Native channel method requires its original canonical outcome",
    );
  const eventId = outcome["eventId"],
    kind = outcome["kind"];
  if (
    outcome["protocol"] !== "native-channel-method-outcome.v1" ||
    typeof outcome["invocationId"] !== "string" ||
    !outcome["invocationId"] ||
    typeof outcome["transportCallId"] !== "string" ||
    !outcome["transportCallId"] ||
    outcome["envelopeId"] !== `terminal:${outcome["transportCallId"]}` ||
    (typeof eventId !== "number" || !Number.isSafeInteger(eventId) || eventId <= 0) ||
    (kind !== "invocation.completed" &&
      kind !== "invocation.failed" &&
      kind !== "invocation.cancelled" &&
      kind !== "invocation.abandoned") ||
    !("value" in outcome)
  )
    throw new Error(
      "Native channel method requires its original canonical outcome",
    );
  return {
    protocol: "native-channel-method-outcome.v1",
    envelopeId: outcome["envelopeId"] as string,
    invocationId: outcome["invocationId"] as string,
    transportCallId: outcome["transportCallId"] as string,
    eventId,
    kind,
    value: outcome["value"]!,
  };
}

function canonicalOutcomeIdentity(outcome: NativeChannelMethodOutcome): string {
  return canonicalJson(outcome);
}

function result(
  outcome: NativeChannelMethodOutcome,
): ToolExecutionResult<NativeChannelMethodOutcome> {
  return {
    content: [
      {
        type: "text",
        text:
          typeof outcome.value === "string"
            ? outcome.value
            : JSON.stringify(outcome.value),
      },
    ],
    details: outcome,
    ...(outcome.kind === "invocation.completed" ? {} : { isError: true }),
  };
}
async function originalStart(
  client: Pick<ChannelClient, "getEnvelope">,
  request: CanonicalMethodRequest,
  call: MethodCall,
) {
  const envelope = await client.getEnvelope(call.invocationId);
  if (!envelope) return false;
  if (
    envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
    envelope.messageId !== call.invocationId
  )
    throw new Error("Channel method start conflicts with its native admission");
  const started = eventKindSchemas["invocation.started"].parse(
    envelope.payload,
  );
  const transport = started.payload.transport;
  if (
    started.causality?.invocationId !== call.invocationId ||
    started.causality?.transportCallId !== call.callId ||
    (started.actor.participantId ?? started.actor.id) !== request.callerId ||
    started.payload.name !== request.method ||
    canonicalJson(started.payload.request) !== canonicalJson(request.args) ||
    transport?.kind !== "channel" ||
    transport.channelId !== request.channelId ||
    transport.transportCallId !== call.callId ||
    (transport.target.participantId ?? transport.target.id) !== call.targetId
  )
    throw new Error("Channel method start conflicts with its native admission");
  return true;
}
async function terminal(
  client: Pick<ChannelClient, "getEnvelope">,
  call: MethodCall,
): Promise<NativeChannelMethodOutcome | null> {
  const envelope = await client.getEnvelope(`terminal:${call.callId}`);
  if (!envelope) return null;
  if (
    envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
    envelope.messageId !== `terminal:${call.callId}`
  )
    throw new Error(
      "Channel method terminal conflicts with its native admission",
    );
  const kind = (envelope.payload as { kind?: unknown } | null)?.kind;
  if (
    kind !== "invocation.completed" &&
    kind !== "invocation.failed" &&
    kind !== "invocation.cancelled" &&
    kind !== "invocation.abandoned"
  )
    throw new Error("Channel method has no canonical terminal outcome");
  const event = eventKindSchemas[kind].parse(envelope.payload);
  if (
    event.causality?.invocationId !== call.invocationId ||
    event.causality?.transportCallId !== call.callId
  )
    throw new Error(
      "Channel method terminal conflicts with its native admission",
    );
  const value =
    event.kind === "invocation.completed"
      ? event.payload.result
      : (event.payload.error ?? event.payload.reason);
  return {
    protocol: "native-channel-method-outcome.v1",
    invocationId: call.invocationId,
    transportCallId: call.callId,
    envelopeId: envelope.messageId,
    eventId: envelope.id,
    kind,
    value: copyJson(value ?? null),
  };
}

/** Read the original canonical route before its result. A delivered envelope
 * can prompt this read, but cannot authenticate a call or supply its outcome. */
export async function readCanonicalChannelMethodOutcome(
  client: Pick<ChannelClient, "getEnvelope">,
  request: CanonicalMethodRequest,
  call: ChannelMethodCall,
): Promise<NativeChannelMethodOutcome | null> {
  if (!(await originalStart(client, request, call))) {
    const envelope = await client.getEnvelope(`terminal:${call.callId}`);
    if (!envelope) return null;
    if (
      envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
      envelope.messageId !== `terminal:${call.callId}`
    )
      throw new Error(
        "Channel cancellation conflicts with its original admission",
      );
    // The start can commit between these two reads. Recheck the actual root
    // when a terminal appears; never reinterpret an admitted execution as an
    // absent-admission cancellation.
    if (await originalStart(client, request, call))
      return terminal(client, call);
    const event = eventKindSchemas["invocation.cancelled"].parse(
      envelope.payload,
    );
    const original = event.payload.admission?.request;
    if (
      !original ||
      canonicalJson(original) !==
        canonicalJson(channelMethodOriginalRequest(request, call)) ||
      (event.actor.participantId ?? event.actor.id) !== request.callerId ||
      event.causality?.invocationId !== call.invocationId ||
      event.causality.transportCallId !== call.callId
    )
      throw new Error(
        "Channel cancellation has no exact not-admitted original request",
      );
    return terminal(client, call);
  }
  return terminal(client, call);
}

/** Provider ownership begins at its authenticated channel claim. The canonical
 * start supplies the original caller; every remaining route field must match
 * the operation actually delivered to this provider. */
export async function readCanonicalChannelProviderOutcome(
  client: Pick<ChannelClient, "getEnvelope">,
  operation: {
    channelId: string;
    targetId: string;
    invocationId: string;
    callId: string;
    method: string;
    args: JsonValue | undefined;
  },
): Promise<NativeChannelMethodOutcome | null> {
  const envelope = await client.getEnvelope(operation.invocationId);
  if (!envelope) {
    const cancelledEnvelope = await client.getEnvelope(
      `terminal:${operation.callId}`,
    );
    if (
      cancelledEnvelope?.type === AGENTIC_EVENT_PAYLOAD_KIND &&
      (cancelledEnvelope.payload as { kind?: unknown })?.kind ===
        "invocation.cancelled"
    ) {
      const cancelled = eventKindSchemas["invocation.cancelled"].parse(
        cancelledEnvelope.payload,
      );
      const original = cancelled.payload.admission?.request;
      if (original) {
        // The immutable delivered operation supplies every route/argument
        // except caller. Only this genuine domain receipt supplies that caller;
        // the common reader validates the full original request and closes the
        // start-between-reads race before accepting its terminal.
        return readCanonicalChannelMethodOutcome(
          client,
          {
            channelId: operation.channelId,
            callerId: original.callerId,
            targetIds: [operation.targetId],
            method: operation.method,
            args: operation.args,
            ...(original.turnId === undefined
              ? {}
              : { turnId: original.turnId }),
          },
          {
            targetId: operation.targetId,
            invocationId: operation.invocationId,
            callId: operation.callId,
          },
        );
      }
    }
    throw new Error("Channel provider claim has no original canonical start");
  }
  const start = eventKindSchemas["invocation.started"].parse(envelope.payload);
  const call = {
    targetId: operation.targetId,
    invocationId: operation.invocationId,
    callId: operation.callId,
  };
  if (
    !(await originalStart(
      client,
      {
        channelId: operation.channelId,
        callerId: start.actor.participantId ?? start.actor.id,
        targetIds: [operation.targetId],
        method: operation.method,
        args: operation.args,
      },
      call,
    ))
  )
    throw new Error("Channel provider claim has no original canonical start");
  return terminal(client, call);
}

/** Replayed provider lifecycle may outlive its activation-local operation. Only
 * a genuine canonical channel start targeted at this provider can authorize
 * consuming that terminal without opening a reasoning conversation. */
export async function readCanonicalChannelProviderTerminal(
  client: Pick<ChannelClient, "getEnvelope">,
  operation: {
    channelId: string;
    targetId: string;
    invocationId: string;
    callId: string;
  },
): Promise<NativeChannelMethodOutcome | null> {
  const envelope = await client.getEnvelope(operation.invocationId);
  if (!envelope) {
    const cancelledEnvelope = await client.getEnvelope(
      `terminal:${operation.callId}`,
    );
    if (
      cancelledEnvelope?.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
      (cancelledEnvelope.payload as { kind?: unknown })?.kind !==
        "invocation.cancelled"
    )
      return null;
    const cancelled = eventKindSchemas["invocation.cancelled"].parse(
      cancelledEnvelope.payload,
    );
    const original = cancelled.payload.admission?.request;
    if (
      !original ||
      original.channelId !== operation.channelId ||
      original.targetId !== operation.targetId ||
      original.invocationId !== operation.invocationId ||
      original.transportCallId !== operation.callId
    )
      return null;
    return readCanonicalChannelProviderOutcome(client, {
      ...operation,
      method: original.method,
      args: original.args === undefined ? undefined : copyJson(original.args),
    });
  }
  if (
    !envelope ||
    envelope.type !== AGENTIC_EVENT_PAYLOAD_KIND ||
    (envelope.payload as { kind?: unknown })?.kind !== "invocation.started"
  )
    return null;
  const start = eventKindSchemas["invocation.started"].parse(envelope.payload);
  const transport = start.payload.transport;
  if (
    transport?.kind !== "channel" ||
    transport.channelId !== operation.channelId ||
    (transport.target.participantId ?? transport.target.id) !==
      operation.targetId
  )
    return null;
  return readCanonicalChannelProviderOutcome(client, {
    ...operation,
    method: start.payload.name,
    args:
      start.payload.request === undefined
        ? undefined
        : copyJson(start.payload.request),
  });
}

export function channelMethodOriginalRequest(
  request: CanonicalMethodRequest,
  call: ChannelMethodCall,
): ChannelMethodOriginalRequest {
  return {
    channelId: request.channelId,
    callerId: request.callerId,
    targetId: call.targetId,
    invocationId: call.invocationId,
    transportCallId: call.callId,
    method: request.method,
    args: request.args,
    ...(request.turnId === undefined ? {} : { turnId: request.turnId }),
  };
}

async function joinMethodCleanup(operations: Promise<void>[]): Promise<void> {
  const failures = (await Promise.allSettled(operations))
    .filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    )
    .map((outcome) => outcome.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Channel method provider cleanup failed",
      { cause: failures[0] },
    );
}

/** Hints carry no result authority. Read the exact canonical starts and terminal,
 * join losing provider calls, then atomically deliver the owned native receipt. */
export async function consumeNativeChannelMethodReceipt(
  harness: Harness,
  commit: Pick<Harness, "commit">,
  key: string,
  client: ChannelMethodClient,
  context: Context,
): Promise<{ accepted: boolean }> {
  const admission = await harness.snapshot(MethodAdmission, key, context);
  if (!admission?.binding || !admission.request) return { accepted: false };
  const request = admission.request;
  const observed: NativeChannelMethodOutcome[] = [];
  for (const call of admission.calls) {
    // A fast answer may arrive during partial fan-out admission. The executing
    // native continuation reads again after the complete audience is admitted.
    const started = await originalStart(client, request, call);
    const outcome = await readCanonicalChannelMethodOutcome(
      client,
      request,
      call,
    );
    if (!started && !outcome) return { accepted: false };
    if (outcome) observed.push(outcome);
  }
  observed.sort((a, b) => a.eventId - b.eventId);
  const candidate = admission.winner ?? observed[0];
  if (!candidate) return { accepted: false };
  if (
    !observed.some(
      (outcome) => canonicalOutcomeIdentity(outcome) === canonicalOutcomeIdentity(candidate),
    )
  )
    throw new Error("Channel method winner lost its canonical terminal");
  let winner = candidate;
  await commit.commit(async (tx) => {
    const retained = await tx.doc(MethodAdmission, key, null);
    if (retained.binding !== admission.binding)
      throw new Error(
        "Channel method receipt conflicts with its native binding",
      );
    retained.winner ??= candidate;
    winner = validateOutcome(retained.winner);
  }, context);
  await joinMethodCleanup(
    admission.calls.map(async (call) => {
      const outcome = await readCanonicalChannelMethodOutcome(
        client,
        request,
        call,
      );
      if (outcome?.envelopeId === winner.envelopeId) return;
      await client.cancelCall(
        request.callerId,
        call.callId,
        channelMethodOriginalRequest(request, call),
      );
      if (!(await readCanonicalChannelMethodOutcome(client, request, call)))
        throw new Error(
          "Channel method sibling cancellation has no canonical outcome",
        );
    }),
  );
  await commit.commit(async (tx) => {
    const retained = await tx.doc(MethodAdmission, key, null);
    if (
      retained.binding !== admission.binding ||
      (!retained.winner || canonicalOutcomeIdentity(retained.winner) !== canonicalOutcomeIdentity(winner))
    )
      throw new Error(
        "Channel method receipt conflicts with its retained winner",
      );
    await acceptReceipt(tx, key, admission.binding, winner);
  }, context);
  return { accepted: true };
}

/** The native run that owns this tool task, as its published turn identity. */
async function callingTurn(
  harness: Harness,
  api: ToolExecutionApi,
  context: Context,
): Promise<{ turnId?: string }> {
  const product = await nativeTaskProductContext(harness, api.taskId, context);
  const input = product?.inputs[0];
  return input === undefined
    ? {}
    : { turnId: nativeTurnId(api.conversationId, input) };
}

/** The native tool task owns the continuation; the channel owns dispatch,
 * provider claim fencing and terminal truth. Neither reimplements the other. */
export function createNativeChannelMethodExecution(
  host: NativeChannelMethodHost,
) {
  async function invocation(api: ToolExecutionApi, context: Context) {
    const execution = await host.bindExecution(api, context);
    const key = `${execution.invocationId}:channel-method`;
    const harness = host.harness();
    const admission = await harness.snapshot(MethodAdmission, key, context);
    if (
      admission?.binding &&
      (admission.taskId !== api.taskId ||
        admission.conversationId !== api.conversationId ||
        admission.toolCallId !== api.callId)
    )
      throw new Error("Channel method belongs to another native task");
    if (
      api.continuation !== undefined &&
      canonicalJson(api.continuation) !==
        canonicalJson({
          kind: "channel-method",
          key,
          binding: admission?.binding,
        })
    )
      throw new Error(
        "Channel method continuation conflicts with its original admission",
      );
    return { execution, key, harness, admission };
  }
  return {
    execute: async (
      selectRequest: () => Promise<NativeChannelMethodRequest>,
      api: ToolExecutionApi,
      context: Context,
    ): Promise<
      ToolExecutionResult<NativeChannelMethodOutcome> | ToolExecutionWait
    > => {
      const { execution, key, harness, admission } = await invocation(
        api,
        context,
      );
      const request =
        admission?.request ??
        validateRequest({
          ...(await selectRequest()),
          ...(await callingTurn(harness, api, context)),
        });
      const binding = sha256HexSyncText(
        canonicalJson({
          taskId: api.taskId,
          conversationId: api.conversationId,
          callId: api.callId,
          request,
        }),
      );
      const calls = request.targetIds.map((targetId) => {
        const id = `${key}:${sha256HexSyncText(targetId)}`;
        return { targetId, invocationId: id, callId: id };
      });
      await api.retainContinuation(
        { kind: "channel-method", key, binding },
        async (tx: Tx) => {
          const retained = await tx.doc(MethodAdmission, key, null);
          if (retained.binding && retained.binding !== binding)
            throw new Error(
              "Channel method conflicts with its original admission",
            );
          if (!(await tx.conversation(api.conversationId)))
            throw new Error("Channel method has no owning conversation");
          retained.binding = binding;
          retained.taskId = api.taskId;
          retained.conversationId = api.conversationId;
          retained.toolCallId = api.callId;
          retained.request = request;
          retained.calls = calls;
          await bindReceipt(tx, key, binding);
        },
        context,
      );
      const client = host.channelClient(request.channelId, execution);
      const consumed = await harness.snapshot(ReceiptDoc, key, context);
      if (consumed?.result !== undefined)
        return result(validateOutcome(consumed.result));
      for (const call of calls) {
        // Verify an existing canonical route before any dispatch redrive.
        await originalStart(client, request, call);
        await client.callMethod(
          request.callerId,
          call.targetId,
          call.callId,
          request.method,
          request.args,
          {
            invocationId: call.invocationId,
            transportCallId: call.callId,
            ...(request.turnId === undefined ? {} : { turnId: request.turnId }),
          },
        );
      }
      await consumeNativeChannelMethodReceipt(
        harness,
        api,
        key,
        client,
        context,
      );
      const receipt = await harness.snapshot(ReceiptDoc, key, context);
      if (receipt?.result !== undefined)
        return result(validateOutcome(receipt.result));
      return {
        wait: { kind: "receipt", key, binding },
        continuation: { kind: "channel-method", key, binding },
      };
    },
    cancel: async (
      api: ToolExecutionApi,
      context: Context,
    ): Promise<ToolExecutionResult> => {
      const { execution, admission } = await invocation(api, context);
      if (!admission?.request) return { content: [] };
      const client = host.channelClient(admission.request.channelId, execution);
      const request = admission.request;
      await joinMethodCleanup(
        admission.calls.map(async (call) => {
          await client.cancelCall(
            request.callerId,
            call.callId,
            channelMethodOriginalRequest(request, call),
          );
          if (!(await readCanonicalChannelMethodOutcome(client, request, call)))
            throw new Error(
              "Channel method cancellation has no canonical outcome",
            );
        }),
      );
      // Cancellation owns cleanup and completes the actual native abort phase;
      // it must not manufacture an unanswered user response receipt.
      return { content: [] };
    },
  };
}
