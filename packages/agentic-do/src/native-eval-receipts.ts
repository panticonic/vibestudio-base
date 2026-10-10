import type { Context, JsonValue } from "@panticonic/pi-chord";
import {
  acceptReceipt,
  bindReceipt,
  defineDocFamily,
  defineTask,
  type ConversationId,
  type TaskId,
  type TaskRuntime,
  type Harness,
  type Tx,
} from "@panticonic/pi-durable";
import {
  evalGetArgsSchema,
  evalMethods,
  evalResultReceiptSchema,
  evalStartResultSchema,
  type EvalCall,
  type EvalRunRoute,
  type EvalResultReceipt,
} from "@vibestudio/service-schemas/eval";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";

export type EvalReceiptCommit = Pick<Harness, "commit">;

const EvalAdmission = defineDocFamily<
  {
    binding: string;
    conversationId: ConversationId | null;
    acknowledgement: TaskId | null;
    route: {
      runId: string;
      scopeKey?: string;
      target?:
        | { kind: "caller" }
        | { kind: "owner-session"; sessionId: string };
    };
    runDigest: string;
    outcome: { runDigest: string; resultDigest: string } | null;
  },
  null
>({
  kind: "vibestudio.eval-admission",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({
    binding: "",
    conversationId: null,
    acknowledgement: null,
    route: { runId: "" },
    runDigest: "",
    outcome: null,
  }),
  checkpointWhen: () => true,
});

/** A pre-transport route may exist before the domain has acknowledged admission. */
export async function retainedEvalAdmission(
  harness: Harness,
  key: string,
  context: Context,
) {
  const admission = await harness.snapshot(EvalAdmission, key, context);
  return admission?.binding ? admission : undefined;
}

/** Read a committed operation route without creating an admission document. */
export async function retainedEvalRunRoute(
  harness: Harness,
  key: string,
  context: Context,
): Promise<EvalRunRoute> {
  const admission = await harness.snapshot(EvalAdmission, key, context);
  if (!admission?.binding)
    throw new Error("Eval receipt has no retained domain admission");
  return admission.route;
}

/** Commit the immutable route before crossing the domain admission boundary. */
export async function bindEvalRun(
  tx: Tx,
  key: string,
  binding: string,
  route: EvalRunRoute,
  conversationId: ConversationId,
): Promise<void> {
  const parsed = evalGetArgsSchema.parse(route);
  const admission = await tx.doc(EvalAdmission, key, null);
  if (
    admission.binding &&
    (admission.binding !== binding ||
      admission.conversationId !== conversationId ||
      admission.route.runId !== parsed.runId ||
      admission.route.scopeKey !== parsed.scopeKey ||
      admission.route.target?.kind !== parsed.target?.kind ||
      (admission.route.target?.kind === "owner-session" &&
        parsed.target?.kind === "owner-session" &&
        admission.route.target.sessionId !== parsed.target.sessionId))
  ) {
    throw new Error("Eval operation conflicts with its retained route");
  }
  const conversation = await tx.conversation(conversationId);
  if (!conversation)
    throw new Error("Eval admission has no owning conversation");
  admission.binding = binding;
  admission.conversationId = conversationId;
  admission.route = parsed;
  await bindReceipt(tx, key, binding);
}

/** The authenticated start response binds the domain's accepted input digest. */
export async function recordEvalAdmission(
  tx: Tx,
  key: string,
  response: unknown,
): Promise<void> {
  const accepted = evalStartResultSchema.parse(response);
  const admission = await tx.doc(EvalAdmission, key, null);
  if (!admission.binding || admission.route.runId !== accepted.runId)
    throw new Error("Eval admission does not match a bound operation");
  if (admission.runDigest && admission.runDigest !== accepted.runDigest)
    throw new Error("Eval admission conflicts with its retained input digest");
  admission.runDigest = accepted.runDigest;
}

/** Canonical cancellation/readback can establish the digest after a lost start response. */
export async function recordEvalReceiptAdmission(
  tx: Tx,
  key: string,
  observed: unknown,
): Promise<void> {
  const receipt = evalResultReceiptSchema.parse(observed);
  const admission = await tx.doc(EvalAdmission, key, null);
  if (!admission.binding || admission.route.runId !== receipt.runId)
    throw new Error("Eval receipt does not match a bound operation");
  if (admission.runDigest && admission.runDigest !== receipt.runDigest)
    throw new Error("Eval admission conflicts with its retained input digest");
  admission.runDigest = receipt.runDigest;
}

/** Native invocations consume through their live capability; host hints use the admitted Session. */
export async function retainObservedEvalReceipt(
  harness: Harness,
  commit: EvalReceiptCommit,
  key: string,
  observed: unknown,
  acknowledgement: NativeEvalAcknowledgements,
  context: Context,
): Promise<EvalResultReceipt> {
  const receipt = evalResultReceiptSchema.parse(observed);
  const admission = await retainedEvalAdmission(harness, key, context);
  if (!admission?.binding)
    throw new Error("Eval receipt has no retained domain admission");
  if (
    receipt.runId !== admission.route.runId ||
    (admission.runDigest !== "" && receipt.runDigest !== admission.runDigest)
  )
    throw new Error("Eval receipt conflicts with its retained admission");
  const result: JsonValue = JSON.parse(JSON.stringify(receipt.result));
  await commit.commit(async (tx) => {
    const retained = await tx.doc(EvalAdmission, key, null);
    const outcome = {
      runDigest: receipt.runDigest,
      resultDigest: receipt.resultDigest,
    };
    if (
      retained.binding !== admission.binding ||
      (retained.runDigest !== "" && retained.runDigest !== receipt.runDigest) ||
      (retained.outcome !== null &&
        canonicalJson(retained.outcome) !== canonicalJson(outcome))
    )
      throw new Error("Eval receipt conflicts with its retained outcome");
    if (retained.conversationId === null)
      throw new Error("Eval receipt has no owning native conversation");
    if (retained.acknowledgement === null)
      retained.acknowledgement = await tx.createTask(
        acknowledgement.task,
        { route: retained.route, ...outcome },
        {
          conversationId: retained.conversationId,
          ownership: { kind: "conversation" },
          background: true,
        },
      );
    retained.runDigest = receipt.runDigest;
    retained.outcome = outcome;
    await acceptReceipt(tx, key, admission.binding, result);
  }, context);
  return receipt;
}

/**
 * Treat a completion event as a hint. Read domain truth through the owner's
 * authenticated service client, commit the actual result, then acknowledge the
 * exact receipt. A failed acknowledgement leaves a safely repeatable commit.
 * Callers must authenticate the hint and open their bound Session first.
 */
export async function consumeEvalReceipt(
  harness: Harness,
  commit: EvalReceiptCommit,
  key: string,
  call: EvalCall,
  acknowledgement: NativeEvalAcknowledgements,
  context: Context,
): Promise<{ accepted: boolean }> {
  const admission = await harness.snapshot(EvalAdmission, key, context);
  if (!admission?.binding)
    throw new Error("Eval receipt has no retained domain admission");
  const observed = await call<unknown>("eval.receipt", [admission.route]);
  if (observed === null) return { accepted: false };
  await retainObservedEvalReceipt(
    harness,
    commit,
    key,
    observed,
    acknowledgement,
    context,
  );
  const retained = await retainedEvalAdmission(harness, key, context);
  if (!retained?.acknowledgement)
    throw new Error("Eval receipt lost its native acknowledgement owner");
  const settled = await harness.waitForTask(retained.acknowledgement, context);
  if (settled.state.outcome.status !== "completed")
    throw new Error("Eval receipt acknowledgement did not complete", {
      cause: settled.state.outcome,
    });
  return { accepted: true };
}

export interface EvalAcknowledgementInput {
  route: EvalRunRoute;
  runDigest: string;
  resultDigest: string;
}

/** Both ordinary execution and cancellation discharge the same accepted domain debt. */
export function createNativeEvalAcknowledgements(
  call: <T>(method: string, args: unknown[], context: Context) => Promise<T>,
) {
  const task = defineTask<
    EvalAcknowledgementInput,
    { phase: "acknowledge" },
    null
  >({
    name: "vibestudio.eval-acknowledgement",
    version: 1,
    initial: () => ({ phase: "acknowledge" }),
    phases: {
      acknowledge: (task, rt, context) => deliver(task.input, rt, context),
    },
    abort: (task, rt, context) => deliver(task.input, rt, context),
  });
  async function deliver(
    input: EvalAcknowledgementInput,
    rt: TaskRuntime<
      EvalAcknowledgementInput,
      { phase: "acknowledge" },
      null,
      object
    >,
    context: Context,
  ) {
    try {
      evalMethods.acknowledge.returns.parse(
        await call<unknown>(
          "eval.acknowledge",
          [
            {
              ...input.route,
              receipt: {
                runDigest: input.runDigest,
                resultDigest: input.resultDigest,
              },
            },
          ],
          context,
        ),
      );
      await rt.commit(
        () => ({
          status: "terminal",
          outcome: { status: "completed", result: null },
        }),
        context,
      );
    } catch (error) {
      await rt.parkFailure(error, context);
    }
  }
  return { task };
}
export type NativeEvalAcknowledgements = ReturnType<
  typeof createNativeEvalAcknowledgements
>;
