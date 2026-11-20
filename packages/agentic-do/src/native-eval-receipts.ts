import type { Context, JsonValue } from "@panticonic/pi-chord";
import { z } from "zod";
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
  evalResultIdentitySchema,
  evalResultReceiptSchema,
  type EvalRunEvent,
  type EvalRunRoute,
  type EvalResultReceipt,
} from "@vibestudio/service-schemas/eval";
import { createDynamicCodeRunObserver } from "@vibestudio/service-schemas/dynamicCode";
import type { RpcClient } from "@vibestudio/rpc";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";

export type EvalReceiptCommit = Pick<Harness, "commit">;

const EvalAdmission = defineDocFamily<
  {
    binding: string;
    conversationId: ConversationId | null;
    acknowledgement: TaskId | null;
    /** The background task that pulls the run's terminal row (created once the run is started). */
    awaiting: TaskId | null;
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
    awaiting: null,
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

/** What the hosting entity's `start` answers: the run and the digest of its accepted input. */
const evalStartAckSchema = z
  .object({ runId: z.string().min(1), runDigest: z.string().regex(/^[a-f0-9]{64}$/) })
  .passthrough();

/** The authenticated start response binds the domain's accepted input digest. */
export async function recordEvalAdmission(
  tx: Tx,
  key: string,
  response: unknown,
): Promise<void> {
  const accepted = evalStartAckSchema.parse(response);
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

/**
 * Accept the run's exact terminal receipt in one transaction: bind it to the retained admission,
 * create the acknowledgement task once, and resolve the parked tool call. Repeating it with the
 * same receipt changes nothing, so the tool's own read, a cancellation and the await task may all
 * arrive at it.
 */
export async function retainEvalReceiptTx(
  tx: Tx,
  key: string,
  receiptInput: unknown,
  acknowledgement: NativeEvalAcknowledgements,
): Promise<EvalResultReceipt> {
  const receipt = evalResultReceiptSchema.parse(receiptInput);
  const retained = await tx.doc(EvalAdmission, key, null);
  if (!retained.binding)
    throw new Error("Eval receipt has no retained domain admission");
  if (
    receipt.runId !== retained.route.runId ||
    (retained.runDigest !== "" && receipt.runDigest !== retained.runDigest)
  )
    throw new Error("Eval receipt conflicts with its retained admission");
  const outcome = {
    runDigest: receipt.runDigest,
    resultDigest: receipt.resultDigest,
  };
  if (
    retained.outcome !== null &&
    canonicalJson(retained.outcome) !== canonicalJson(outcome)
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
  const result: JsonValue = JSON.parse(JSON.stringify(receipt.result));
  await acceptReceipt(tx, key, retained.binding, result);
  return receipt;
}

/** Native invocations consume through their live capability; the await task through its own task commit. */
export async function retainObservedEvalReceipt(
  _harness: Harness,
  commit: EvalReceiptCommit,
  key: string,
  observed: unknown,
  acknowledgement: NativeEvalAcknowledgements,
  context: Context,
): Promise<EvalResultReceipt> {
  const receipt = evalResultReceiptSchema.parse(observed);
  await commit.commit(
    (tx) => retainEvalReceiptTx(tx, key, receipt, acknowledgement),
    context,
  );
  return receipt;
}

export interface EvalAcknowledgementInput {
  route: EvalRunRoute;
  runDigest: string;
  resultDigest: string;
}

/** The calls the owner makes on the entity that hosts its kernel (a pull; nothing is pushed to the owner). */
export type EvalSessionRpc = Pick<RpcClient, "call">;

/**
 * The entity that hosts this owner's kernel: the owner itself (docs/dolt-redesign.md §6.11.6). Its
 * class declares `hosts` for the kernel in its manifest, so the host admits its runs on it and
 * creates no session entity (a class that does not declare it gets one, and the eval tool refuses its admission).
 */
export function evalHostId(ownerId: string): string {
  return ownerId;
}

/** Both ordinary execution and cancellation discharge the same accepted domain debt. */
export function createNativeEvalAcknowledgements(deps: {
  readonly rpc: EvalSessionRpc;
  /** The owner's own runtime id: it is the entity that hosts its kernel. */
  readonly ownerId: () => string;
}) {
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
      const hostId = evalHostId(deps.ownerId());
      const observer = createDynamicCodeRunObserver(deps.rpc, {
        hostId,
        runId: input.route.runId,
      });
      await observer.acknowledge(
        evalResultIdentitySchema.parse({
          runDigest: input.runDigest,
          resultDigest: input.resultDigest,
        }),
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

export interface EvalAwaitInput {
  route: EvalRunRoute;
}

type EvalAwaitCheckpoint = {
  phase: "pull";
  /** The last event sequence already handed to `onEvents`: a restart continues after it. */
  after: number;
  /** Consecutive failed pulls (the sleep before the next one grows with it). */
  failures: number;
};

/** A refusal that retrying the same pull cannot change: the incident is parked for a repair. */
const PERMANENT_PULL_CODES: ReadonlySet<string> = new Set(["ENOTFOUND", "EACCES", "EINVAL"]);
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "cancelled",
  "approval-route-lost",
]);
/** How long one pull blocks (a run that ends ends it at once); also the latency of live output. */
const EVAL_PULL_WAIT_MS = 1_000;
/**
 * One invocation pulls for at most this long and then sleeps. The owner's wake-up pass waits for
 * every live invocation, so a pull that held its invocation for the whole run would hold that pass
 * (and keep the owner from idling) for as long as the user's code runs.
 */
const EVAL_PULL_CYCLE_MS = 15_000;
const EVAL_PULL_PAUSE_MS = 500;
const EVAL_PULL_RETRY_BASE_MS = 2_000;
const EVAL_PULL_RETRY_MAX_MS = 60_000;

/**
 * The background task that settles one eval run by pulling (docs/dolt-redesign.md §7.5).
 *
 * The run's kernel is hosted by the owner itself and commits its terminal row in its own storage.
 * This task asks that entity for it (`await`, `events`), hands the run's events to `onEvents` as
 * they are read, and on the terminal row commits, in one transaction, the receipt acceptance that
 * resolves the parked tool call, the acknowledgement task, and its own completion. Nothing is
 * pushed to the owner, so a restart of the owner finds this task still live and pulls again:
 * the committed row is read once and the receipt is accepted once.
 */
export function createNativeEvalAwait(deps: {
  readonly rpc: EvalSessionRpc;
  readonly ownerId: () => string;
  readonly acknowledgements: NativeEvalAcknowledgements;
  /** Receives each page of the run's events, in order. Best effort: a failure is reported, not retried. */
  readonly onEvents: (
    input: EvalAwaitInput,
    events: readonly EvalRunEvent[],
    context: Context,
  ) => Promise<void>;
  /** Timings (milliseconds); the defaults are the product's. */
  readonly waitMs?: number;
  readonly cycleMs?: number;
  readonly pauseMs?: number;
  readonly retryBaseMs?: number;
}) {
  const task = defineTask<EvalAwaitInput, EvalAwaitCheckpoint, null>({
    name: "vibestudio.eval-await",
    version: 1,
    initial: () => ({ phase: "pull", after: 0, failures: 0 }),
    phases: {
      pull: (running, rt, context) => pull(running.input, running.state.checkpoint, rt, context),
    },
    abort: async (_running, rt, context) => {
      // The tool call's own cancellation owns the run and its receipt; this task only stops pulling.
      await rt.commit(
        () => ({
          status: "terminal",
          outcome: { status: "aborted", reason: "eval pull aborted" },
        }),
        context,
      );
    },
  });

  async function pull(
    input: EvalAwaitInput,
    start: EvalAwaitCheckpoint,
    rt: TaskRuntime<EvalAwaitInput, EvalAwaitCheckpoint, null, object>,
    context: Context,
  ): Promise<void> {
    const { route } = input;
    const observer = createDynamicCodeRunObserver(deps.rpc, {
      hostId: evalHostId(deps.ownerId()),
      runId: route.runId,
    });
    const signal = rt.signal;
    const leaveAt = rt.now() + (deps.cycleMs ?? EVAL_PULL_CYCLE_MS);
    let after = start.after;
    let failures = start.failures;
    for (;;) {
      if (signal.aborted) return;
      let receipt: unknown;
      try {
        const snapshot = await observer.await(deps.waitMs ?? EVAL_PULL_WAIT_MS, { signal });
        const before = after;
        for (;;) {
          const page = await observer.events(after, 256);
          if (page.events.length > 0) {
            try {
              await deps.onEvents(input, page.events, context);
            } catch (error) {
              rt.report(error);
            }
          }
          after = page.next;
          if (!page.hasMore) break;
        }
        if (after !== before || failures !== 0) {
          failures = 0;
          await rt.commit(
            () => ({ status: "running", checkpoint: { phase: "pull", after, failures } }),
            context,
          );
        }
        if (snapshot.status === "unknown")
          throw Object.assign(new Error(`eval: run ${route.runId} is unknown to its kernel`), {
            code: "ENOTFOUND",
          });
        if (!TERMINAL_RUN_STATUSES.has(snapshot.status)) {
          if (rt.now() < leaveAt) continue;
          // Release the invocation; the run goes on in its kernel and is pulled again after the pause.
          await rt.sleepUntil(
            rt.now() + (deps.pauseMs ?? EVAL_PULL_PAUSE_MS),
            { phase: "pull", after, failures },
            context,
          );
          return;
        }
        receipt = await observer.receipt();
        if (receipt === null) throw new Error(`eval: terminal run ${route.runId} has no receipt`);
        // The execution session is only released once the run is terminal; releasing twice is harmless.
        await observer.release().catch(() => undefined);
      } catch (error) {
        if (signal.aborted) return;
        const code = (error as { code?: unknown } | null)?.code;
        if (typeof code === "string" && PERMANENT_PULL_CODES.has(code)) {
          await rt.parkFailure(error, context);
          return;
        }
        failures += 1;
        const delay = Math.min(
          EVAL_PULL_RETRY_MAX_MS,
          (deps.retryBaseMs ?? EVAL_PULL_RETRY_BASE_MS) * 2 ** Math.min(failures - 1, 5),
        );
        await rt.sleepUntil(
          rt.now() + delay,
          { phase: "pull", after, failures },
          context,
        );
        return;
      }
      try {
        await rt.commit(async (tx) => {
          await retainEvalReceiptTx(tx, route.runId, receipt, deps.acknowledgements);
          return { status: "terminal", outcome: { status: "completed", result: null } };
        }, context);
      } catch (error) {
        if (signal.aborted) return;
        await rt.parkFailure(error, context);
      }
      return;
    }
  }
  return { task };
}
export type NativeEvalAwait = ReturnType<typeof createNativeEvalAwait>;

/** Create the run's await task once, in the caller's transaction; replays find it. */
export async function ensureEvalAwaitTask(
  tx: Tx,
  key: string,
  awaiting: NativeEvalAwait,
): Promise<void> {
  const admission = await tx.doc(EvalAdmission, key, null);
  if (!admission.binding || admission.conversationId === null)
    throw new Error("Eval await has no retained domain admission");
  if (admission.awaiting) return;
  admission.awaiting = await tx.createTask(
    awaiting.task,
    { route: admission.route },
    {
      conversationId: admission.conversationId,
      ownership: { kind: "conversation" },
      background: true,
    },
  );
}
