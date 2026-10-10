import type { Context, JsonValue } from "@panticonic/pi-chord";
import {
  acceptReceipt,
  bindReceipt,
  defineDocFamily,
  type Harness,
  type ModelRequestApi,
  type ModelRequestTarget,
  type ModelRequestWait,
  type TaskId,
  type TaskRecord,
  type ToolExecutionApi,
  type Tx,
} from "@panticonic/pi-durable";
import type { AcquisitionInfo } from "@vibestudio/rpc";
import {
  authorityAcquisitionReceiptSchema,
  authorityMethods,
  type AuthorityAcquisitionReceipt,
} from "@vibestudio/service-schemas/authority";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  nativeInvocationId,
  type NativeInvocationIdentity,
} from "@vibestudio/service-schemas/nativeInvocation";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";
import { nativeInvocationOwner } from "./native-invocation-source.js";
import {
  retainedAgentExecutionOwner,
  type AgentExecutionOwner,
  type AgentHostCall,
  type LoadedAgentImage,
} from "./native-agent-session.js";

/** Original host RPC whose owner-authenticated EACQUIRE response the port received. */
export interface AuthorityInvocation {
  readonly service: string;
  readonly method: string;
  readonly args: readonly JsonValue[];
}

const AuthorityAdmission = defineDocFamily<
  {
    binding: string;
    admission: JsonValue;
    invocations: JsonValue;
    createdAt: number;
    owner: JsonValue;
    image: JsonValue;
    invocation: JsonValue;
    request: JsonValue;
    outcome: JsonValue;
  },
  null
>({
  kind: "vibestudio.authority-admission",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({
    binding: "",
    admission: null,
    invocations: null,
    createdAt: 0,
    owner: null,
    image: null,
    invocation: null,
    request: null,
    outcome: null,
  }),
  checkpointWhen: () => true,
});

function assertInvocation(
  receipt: AuthorityAcquisitionReceipt,
  info: AcquisitionInfo,
  invocation: AuthorityInvocation,
  image: LoadedAgentImage,
): void {
  if (
    receipt.acquisitionId !== info.acquisitionId ||
    receipt.admission.ownerRuntimeId !== image.runtimeId ||
    info.ownerRuntimeId !== image.runtimeId ||
    image.runtimeId !==
      `do:${image.source}:${image.className}:${image.objectKey}`
  )
    throw new Error("Authority acquisition does not belong to this owner");
  const first = receipt.invocations[0]!;
  if (
    first.snapshotDigest !== info.snapshotDigest ||
    first.capability !== info.capability ||
    first.resourceKey !== info.resourceKey
  )
    throw new Error(
      "Authority receipt conflicts with its acquisition response",
    );
  const argsDigest = sha256HexSyncText(canonicalJson(invocation.args));
  for (const original of receipt.invocations) {
    if (
      original.ownerRuntimeId !== image.runtimeId ||
      original.sessionId !== receipt.admission.sessionId ||
      !original.code ||
      original.code.repoPath !== image.source ||
      original.code.executionDigest !== image.executionDigest ||
      original.service !== invocation.service ||
      original.method !== invocation.method ||
      original.argsDigest !== argsDigest
    )
      throw new Error(
        "Authority receipt conflicts with the original invocation",
      );
  }
}

/**
 * Pin the original invocation through its task mutation capability. This port
 * uses the detached Native owner client. The authenticated canonical receipt
 * supplies its host-owned authority session; it never borrows an inbound
 * executor session or derives session authority from local runtime identity.
 */
export async function bindAuthorityAcquisition(
  harness: Harness,
  api: ModelRequestApi,
  request: ModelRequestTarget,
  info: AcquisitionInfo,
  invocation: AuthorityInvocation,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<ModelRequestWait> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  if (owner.runtimeId !== image.runtimeId)
    throw new Error("Authority acquisition image differs from the bound owner");
  const observed = await call("authority.acquisitionReceipt", [
    { acquisitionId: info.acquisitionId },
  ]);
  if (observed === null)
    throw new Error("Authority acquisition has no canonical host admission");
  const receipt = authorityAcquisitionReceiptSchema.parse(observed);
  if (receipt.admission.sessionId !== owner.authoritySessionId)
    throw new Error(
      "Authority acquisition belongs to a different owner lifetime",
    );
  assertInvocation(receipt, info, invocation, image);
  const retained = {
    binding: receipt.bindingDigest,
    admission: receipt.admission,
    invocations: receipt.invocations,
    createdAt: receipt.createdAt,
    owner: JSON.parse(JSON.stringify(owner)) as JsonValue,
    image: JSON.parse(JSON.stringify(image)) as JsonValue,
    invocation: JSON.parse(JSON.stringify(invocation)) as JsonValue,
    request: JSON.parse(JSON.stringify(request)) as JsonValue,
  };
  await api.commit(async (tx) => {
    const admission = await tx.doc(
      AuthorityAdmission,
      receipt.acquisitionId,
      null,
    );
    const { outcome: _outcome, ...original } = admission;
    if (
      admission.binding &&
      canonicalJson(original) !== canonicalJson(retained)
    )
      throw new Error(
        "Authority acquisition conflicts with its retained admission",
      );
    Object.assign(admission, retained);
    await bindReceipt(tx, receipt.acquisitionId, receipt.bindingDigest);
    // A decision can precede parking. Commit canonical readiness in the same
    // admission boundary so a notification cannot be lost in that interval.
    if (receipt.state !== "pending") {
      retainOutcome(admission, receipt);
      await acceptReceipt(
        tx,
        receipt.acquisitionId,
        receipt.bindingDigest,
        receipt.resolution,
      );
    }
  }, context);
  // Settlement may race the first read and commit. Once the binding exists,
  // reread canonical truth exactly once; later delivery can now find it.
  if (receipt.state === "pending") {
    const latest = authorityAcquisitionReceiptSchema.parse(
      await call("authority.acquisitionReceipt", [
        { acquisitionId: receipt.acquisitionId },
      ]),
    );
    if (latest.acquisitionId !== receipt.acquisitionId)
      throw new Error(
        "Authority receipt conflicts with its requested identity",
      );
    assertCanonicalAdmission(retained, latest);
    if (latest.state !== "pending")
      await api.commit(async (tx) => {
        const admission = await tx.doc(
          AuthorityAdmission,
          receipt.acquisitionId,
          null,
        );
        retainOutcome(admission, latest);
        await acceptReceipt(
          tx,
          latest.acquisitionId,
          latest.bindingDigest,
          latest.resolution,
        );
      }, context);
  }
  // Acknowledgement belongs to owner reconciliation, outside model admission.
  // Its lost response must not fault a task whose readiness already committed.
  return {
    status: "waiting",
    condition: {
      kind: "receipt",
      key: receipt.acquisitionId,
      binding: receipt.bindingDigest,
    },
  };
}

function assertCanonicalAdmission(
  admission: {
    binding: string;
    createdAt: number;
    admission: JsonValue;
    invocations: JsonValue;
  },
  receipt: AuthorityAcquisitionReceipt,
): void {
  if (
    receipt.bindingDigest !== admission.binding ||
    receipt.createdAt !== admission.createdAt ||
    canonicalJson(receipt.admission) !== canonicalJson(admission.admission) ||
    canonicalJson(receipt.invocations) !== canonicalJson(admission.invocations)
  )
    throw new Error("Authority receipt conflicts with its retained admission");
}

function retainOutcome(
  admission: { outcome: JsonValue },
  receipt: Exclude<AuthorityAcquisitionReceipt, { state: "pending" }>,
): void {
  const outcome = {
    state: receipt.state,
    resolution: receipt.resolution,
    resolutionDigest: receipt.resolutionDigest,
    settledAt: receipt.settledAt,
  };
  if (
    admission.outcome !== null &&
    canonicalJson(admission.outcome) !== canonicalJson(outcome)
  )
    throw new Error("Authority receipt conflicts with its retained outcome");
  admission.outcome = outcome;
}

function assertAdmissionOwner(
  admission: { owner: JsonValue; image: JsonValue },
  owner: AgentExecutionOwner,
  image: LoadedAgentImage,
): void {
  const original = admission.image;
  if (
    canonicalJson(owner) !== canonicalJson(admission.owner) ||
    !original ||
    typeof original !== "object" ||
    Array.isArray(original) ||
    original["runtimeId"] !== owner.runtimeId ||
    original["runtimeId"] !== image.runtimeId ||
    original["source"] !== image.source ||
    original["className"] !== image.className ||
    original["objectKey"] !== image.objectKey
  )
    throw new Error("Authority receipt belongs to a different execution owner");
}

async function consumeObserved(
  harness: Harness,
  commit: Pick<Harness, "commit">,
  observed: AuthorityAcquisitionReceipt,
  image: LoadedAgentImage,
  owner: AgentExecutionOwner,
  call: AgentHostCall,
  context: Context,
): Promise<{ accepted: boolean }> {
  let receipt = observed;
  const admission = await harness.snapshot(
    AuthorityAdmission,
    receipt.acquisitionId,
    context,
  );
  if (!admission?.binding)
    throw new Error("Authority receipt has no retained domain admission");
  assertAdmissionOwner(admission, owner, image);
  assertCanonicalAdmission(admission, receipt);
  if (receipt.state === "pending") {
    const request = admission.request;
    if (
      !request ||
      typeof request !== "object" ||
      Array.isArray(request) ||
      typeof request["taskId"] !== "number" ||
      !Number.isSafeInteger(request["taskId"]) ||
      typeof request["conversationId"] !== "number" ||
      (request["kind"] !== "native" &&
        !["stream", "complete", "fetchDeferred", "cancelDeferred"].includes(
          String(request["operation"]),
        ))
    )
      throw new Error("Authority admission has no original native request");
    const task = await harness.getTask(request["taskId"] as TaskId, context);
    if (!task || task.conversationId !== request["conversationId"])
      throw new Error("Authority admission has no original native task");
    const ended =
      task.state.status === "terminal" ||
      task.state.status === "completing" ||
      (request["kind"] !== "native" &&
        ((task.state.status === "waiting" &&
          task.state.condition.kind === "failure") ||
          (task.abortRequested && request["operation"] !== "cancelDeferred")));
    if (!ended) return { accepted: false };
    receipt = authorityAcquisitionReceiptSchema.parse(
      await call("authority.withdrawAcquisition", [
        {
          acquisitionId: receipt.acquisitionId,
          bindingDigest: admission.binding,
        },
      ]),
    );
    if (receipt.acquisitionId !== observed.acquisitionId)
      throw new Error(
        "Authority receipt conflicts with its requested identity",
      );
    assertCanonicalAdmission(admission, receipt);
    if (receipt.state === "pending")
      throw new Error(
        "Ended authority operation remains pending after withdrawal",
      );
  }
  await commit.commit(async (tx) => {
    const retained = await tx.doc(
      AuthorityAdmission,
      receipt.acquisitionId,
      null,
    );
    retainOutcome(retained, receipt);
    await acceptReceipt(
      tx,
      receipt.acquisitionId,
      admission.binding,
      receipt.resolution,
    );
  }, context);
  authorityMethods.acknowledgeAcquisition.returns.parse(
    await call("authority.acknowledgeAcquisition", [
      {
        acquisitionId: receipt.acquisitionId,
        resolutionDigest: receipt.resolutionDigest,
      },
    ]),
  );
  return { accepted: true };
}

/** A port failure ends only its original request, while its task capability is still live. */
export async function withdrawFailedModelRequestAuthorities(
  harness: Harness,
  api: ModelRequestApi,
  request: ModelRequestTarget,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<void> {
  // Abort ends the invocation capability. Its durable task mark is reconciled
  // by the owner after cancellation joins; never reopen a Session here.
  if (context.abortSignal?.aborted) return;
  const owner = await retainedAgentExecutionOwner(harness, context);
  for await (const receipt of outstandingAuthorityReceipts(call)) {
    const admission = await harness.snapshot(
      AuthorityAdmission,
      receipt.acquisitionId,
      context,
    );
    if (
      !admission?.binding ||
      canonicalJson(admission.request) !== canonicalJson(request)
    )
      continue;
    assertAdmissionOwner(admission, owner, image);
    assertCanonicalAdmission(admission, receipt);
    if (receipt.state !== "pending") continue;
    await api.commit(async (tx) => {
      const task = await tx.task(request["taskId"]);
      if (
        !task ||
        task.conversationId !== request["conversationId"] ||
        task.state.status !== "running"
      )
        throw new Error(
          "Authority withdrawal requires its active native request",
        );
    }, context);
    const closed = authorityAcquisitionReceiptSchema.parse(
      await call("authority.withdrawAcquisition", [
        {
          acquisitionId: receipt.acquisitionId,
          bindingDigest: admission.binding,
        },
      ]),
    );
    if (closed.acquisitionId !== receipt.acquisitionId)
      throw new Error(
        "Authority receipt conflicts with its requested identity",
      );
    assertCanonicalAdmission(admission, closed);
    if (closed.state === "pending")
      throw new Error(
        "Failed authority operation remains pending after withdrawal",
      );
    await api.commit(async (tx) => {
      const retained = await tx.doc(
        AuthorityAdmission,
        closed.acquisitionId,
        null,
      );
      assertCanonicalAdmission(retained, closed);
      retainOutcome(retained, closed);
      await acceptReceipt(
        tx,
        closed.acquisitionId,
        retained.binding,
        closed.resolution,
      );
    }, context);
    // The returned canonical outcome is already known; consume it while this
    // exact request still owns its mutation capability. Acknowledgement debt
    // remains with ordinary owner reconciliation, independent of this failure.
  }
}

/** Hints carry identity only. Inspect canonical truth for an already committed binding. */
export async function consumeAuthorityReceipt(
  harness: Harness,
  acquisitionId: string,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<{ accepted: boolean }> {
  const admission = await harness.snapshot(
    AuthorityAdmission,
    acquisitionId,
    context,
  );
  if (!admission?.binding)
    throw new Error("Authority receipt has no retained domain admission");
  const owner = await retainedAgentExecutionOwner(harness, context);
  assertAdmissionOwner(admission, owner, image);
  const observed = await call("authority.acquisitionReceipt", [
    { acquisitionId },
  ]);
  if (observed === null) return { accepted: false };
  const receipt = authorityAcquisitionReceiptSchema.parse(observed);
  if (receipt.acquisitionId !== acquisitionId)
    throw new Error("Authority receipt conflicts with its requested identity");
  return consumeObserved(
    harness,
    harness,
    receipt,
    image,
    owner,
    call,
    context,
  );
}

/** Reconcile retained receipt debt on an existing lifecycle wake; unknown admissions stay unacknowledged. */
export async function reconcileAuthorityReceipts(
  harness: Harness,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<void> {
  const owner = await retainedAgentExecutionOwner(harness, context);
  for await (const receipt of outstandingAuthorityReceipts(call)) {
    if (
      !(
        await harness.snapshot(
          AuthorityAdmission,
          receipt.acquisitionId,
          context,
        )
      )?.binding
    ) {
      const identity = receipt.invocations[0]!.nativeInvocation;
      if (
        !identity ||
        identity.owner.runtimeId !== owner.runtimeId ||
        identity.owner.authoritySessionId !== owner.authoritySessionId
      )
        continue;
      const task = await harness.getTask(
        identity.task.taskId as TaskId,
        context,
      );
      if (
        !task ||
        (task.state.status !== "terminal" && task.state.status !== "completing")
      )
        continue;
      const sourceOwner = await nativeInvocationOwner(
        harness,
        image,
        task.conversationId!,
        context,
      );
      assertNativeReceipt(receipt, sourceOwner, image, task, identity);
      await harness.commit(
        (tx) => retainNativeReceipt(tx, receipt, task, owner, image),
        context,
      );
    }
    await consumeObserved(
      harness,
      harness,
      receipt,
      image,
      owner,
      call,
      context,
    );
  }
}

/** Called only after the actual tool execute/cancel has returned a terminal result. */
export async function withdrawNativeToolAuthorities(
  harness: Harness,
  api: Pick<
    ToolExecutionApi,
    "taskId" | "conversationId" | "callId" | "commit"
  >,
  image: LoadedAgentImage,
  call: AgentHostCall,
  context: Context,
): Promise<void> {
  const sourceOwner = await nativeInvocationOwner(
    harness,
    image,
    api.conversationId,
    context,
  );
  const owner = await retainedAgentExecutionOwner(harness, context);
  let original: TaskRecord<JsonValue, JsonValue, unknown> | undefined;
  await api.commit(async (tx) => {
    original = await tx.task(api.taskId);
    if (
      !original ||
      original.kind !== "pi.tool" ||
      original.conversationId !== api.conversationId ||
      original.state.status !== "running" ||
      !original.input ||
      typeof original.input !== "object" ||
      Array.isArray(original.input) ||
      original.input["callId"] !== api.callId
    )
      throw new Error("Authority closure has no original running native tool");
  }, context);
  const task = original!;
  const id = toolInvocationId(task, owner);
  for await (const receipt of outstandingAuthorityReceipts(call)) {
    if (receipt.invocations[0]!.causalParent?.invocationId !== id) continue;
    const identity = receipt.invocations[0]!.nativeInvocation;
    if (!identity)
      throw new Error("Native tool authority has no original coordinates");
    assertNativeReceipt(receipt, sourceOwner, image, task, identity);
    await api.commit(
      (tx) => retainNativeReceipt(tx, receipt, task, owner, image),
      context,
    );
    const terminal =
      receipt.state === "pending"
        ? authorityAcquisitionReceiptSchema.parse(
            await call("authority.withdrawAcquisition", [
              {
                acquisitionId: receipt.acquisitionId,
                bindingDigest: receipt.bindingDigest,
              },
            ]),
          )
        : receipt;
    if (
      terminal.acquisitionId !== receipt.acquisitionId ||
      terminal.state === "pending"
    )
      throw new Error(
        "Native tool authority withdrawal has no exact terminal receipt",
      );
    await consumeObserved(harness, api, terminal, image, owner, call, context);
  }
}

function toolInvocationId(
  task: TaskRecord<JsonValue, JsonValue, unknown>,
  owner: AgentExecutionOwner,
): string {
  const input = task.input;
  if (
    task.kind !== "pi.tool" ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !input["source"] ||
    typeof input["source"] !== "object" ||
    Array.isArray(input["source"]) ||
    (input["source"]["kind"] !== "assistant" &&
      input["source"]["kind"] !== "direct") ||
    typeof input["source"]["entryId"] !== "number" ||
    !Number.isSafeInteger(input["source"]["entryId"]) ||
    typeof input["callId"] !== "string" ||
    !input["callId"]
  )
    throw new Error("Native tool authority has no original call identity");
  return nativeInvocationId({
    owner,
    task: { taskId: task.id, conversationId: task.conversationId },
    operation:
      input["source"]["kind"] === "direct"
        ? {
            kind: "direct-tool",
            directEntryId: input["source"]["entryId"],
            callId: input["callId"],
          }
        : {
            kind: "tool",
            assistantEntryId: input["source"]["entryId"],
            callId: input["callId"],
          },
  });
}

function assertNativeReceipt(
  receipt: AuthorityAcquisitionReceipt,
  owner: Awaited<ReturnType<typeof nativeInvocationOwner>>,
  image: LoadedAgentImage,
  task: TaskRecord<JsonValue, JsonValue, unknown>,
  identity: NativeInvocationIdentity,
): void {
  if (
    identity.owner.runtimeId !== owner.runtimeId ||
    identity.owner.authoritySessionId !== owner.authoritySessionId ||
    identity.task.taskId !== task.id ||
    identity.task.conversationId !== task.conversationId ||
    (identity.operation.kind !== "model"
      ? task.kind !== "pi.tool" ||
        toolInvocationId(task, owner) !== nativeInvocationId(identity)
      : task.kind !==
        (identity.operation.purpose === "generation"
          ? "pi.generation"
          : "pi.compaction"))
  )
    throw new Error(
      "Authority receipt conflicts with its original native task",
    );
  const trajectory = channelTrajectoryFor(owner.channelId);
  const parent = {
    kind: "trajectory-invocation",
    logId: trajectory.logId,
    head: trajectory.head,
    invocationId: nativeInvocationId(identity),
  };
  // The receipt binds trajectory coordinates and native identity separately.
  // A transport locator must agree with that identity without changing it.
  if (
    receipt.admission.ownerRuntimeId !== owner.runtimeId ||
    receipt.admission.sessionId !== owner.authoritySessionId ||
    receipt.invocations.some(
      (invocation) =>
        invocation.ownerRuntimeId !== owner.runtimeId ||
        invocation.sessionId !== owner.authoritySessionId ||
        invocation.code?.repoPath !== image.source ||
        invocation.code.executionDigest !== image.executionDigest ||
        invocation.causalParent?.kind !== parent.kind ||
        invocation.causalParent.logId !== parent.logId ||
        invocation.causalParent.head !== parent.head ||
        invocation.causalParent.invocationId !== parent.invocationId ||
        (invocation.causalParent.nativeInvocation !== undefined &&
          canonicalJson(invocation.causalParent.nativeInvocation) !==
            canonicalJson(identity)) ||
        canonicalJson(invocation.nativeInvocation) !== canonicalJson(identity),
    )
  )
    throw new Error(
      "Authority receipt conflicts with its original native source",
    );
}

async function retainNativeReceipt(
  tx: Tx,
  receipt: AuthorityAcquisitionReceipt,
  task: TaskRecord<JsonValue, JsonValue, unknown>,
  owner: AgentExecutionOwner,
  image: LoadedAgentImage,
): Promise<void> {
  const original = {
    binding: receipt.bindingDigest,
    admission: receipt.admission,
    invocations: receipt.invocations,
    createdAt: receipt.createdAt,
    owner,
    image,
    invocation: null,
    request: {
      kind: "native",
      nativeInvocation: receipt.invocations[0]!.nativeInvocation,
      taskId: task.id,
      conversationId: task.conversationId,
    },
  };
  const admission = await tx.doc(
    AuthorityAdmission,
    receipt.acquisitionId,
    null,
  );
  if (admission.binding) {
    const { outcome: _outcome, ...bound } = admission;
    if (canonicalJson(bound) !== canonicalJson(original))
      throw new Error(
        "Native tool authority conflicts with its retained admission",
      );
  } else Object.assign(admission, JSON.parse(JSON.stringify(original)));
  await bindReceipt(tx, receipt.acquisitionId, receipt.bindingDigest);
}

async function* outstandingAuthorityReceipts(
  call: AgentHostCall,
): AsyncGenerator<AuthorityAcquisitionReceipt> {
  let after: { createdAt: number; acquisitionId: string } | undefined;
  for (;;) {
    const page = authorityMethods.outstandingAcquisitions.returns.parse(
      await call("authority.outstandingAcquisitions", [after ? { after } : {}]),
    );
    for (const receipt of page.receipts) yield receipt;
    if (page.next === null) return;
    const last = page.receipts.at(-1);
    if (
      !last ||
      page.next.createdAt !== last.createdAt ||
      page.next.acquisitionId !== last.acquisitionId ||
      (after &&
        (page.next.createdAt < after.createdAt ||
          (page.next.createdAt === after.createdAt &&
            page.next.acquisitionId <= after.acquisitionId)))
    )
      throw new Error(
        "Authority receipt page did not advance its canonical cursor",
      );
    after = page.next;
  }
}
