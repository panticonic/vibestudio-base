import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { nativeToolAdmissionRefusal } from "./native-tool-refusal.js";
import type { Context } from "@panticonic/pi-chord";
import {
  ReceiptDoc,
  type Harness,
  type ConversationId,
  type ToolExecutionApi,
  type ToolExecutionWait,
} from "@panticonic/pi-durable";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  evalRunResultSchema,
  evalStartInputSchema,
  evalResultReceiptSchema,
} from "@vibestudio/service-schemas/eval";
import {
  createDynamicCodeRunObserver,
  startDynamicCodeRun,
} from "@vibestudio/service-schemas/dynamicCode";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import {
  normalizeEvalToolSource,
  formatEvalResult,
  type EvalToolInput,
  type NativeEvalExecution,
} from "@workspace/harness/tools/eval";
import type { NativeInvocationExecution } from "./native-invocation-boundary.js";
import {
  bindEvalRun,
  ensureEvalAwaitTask,
  evalSessionId,
  recordEvalAdmission,
  recordEvalReceiptAdmission,
  retainedEvalAdmission,
  retainObservedEvalReceipt,
  type NativeEvalAcknowledgements,
  type NativeEvalAwait,
} from "./native-eval-receipts.js";

export interface NativeEvalHost {
  /** Already admitted owner Session; never opens/reenters from a tool invocation. */
  readonly harness: () => Harness;
  readonly acknowledgements: NativeEvalAcknowledgements;
  /** The background pull that settles a started run; a restart of this owner resumes it. */
  readonly awaiting: NativeEvalAwait;
  /** This owner's runtime id: the entity that hosts its kernel is named from it and the scope. */
  readonly ownerId: () => string;
  /** Resolve the actual owned channel binding; caller input cannot select a notebook. */
  readonly scopeForConversation: (
    conversationId: ConversationId,
    context: Context,
  ) => Promise<string>;
  readonly bindExecution: (
    api: ToolExecutionApi,
    context: Context,
  ) => Promise<NativeInvocationExecution>;
}

/**
 * Short admission/control calls. The kernel (hosted by this owner's session entity) owns
 * execution and its cancellation cleanup; the result is pulled, by the await task.
 */
export function createNativeEvalExecution(
  host: NativeEvalHost,
): NativeEvalExecution {
  async function invocation(
    args: EvalToolInput,
    api: ToolExecutionApi,
    context: Context,
  ) {
    const execution = await host.bindExecution(api, context);
    const scopeKey = await host.scopeForConversation(
      api.conversationId,
      context,
    );
    if (!scopeKey)
      throw new Error("Native Eval requires its owned channel scope");
    const input = evalStartInputSchema.parse(
      JSON.parse(
        JSON.stringify({
          runId: execution.invocationId,
          scope: { key: scopeKey },
          source: normalizeEvalToolSource(args),
          ...(args.reset === undefined ? {} : { reset: args.reset }),
          ...(args.imports === undefined ? {} : { imports: args.imports }),
          ...(args.timeoutMs === undefined
            ? {}
            : { timeoutMs: args.timeoutMs }),
          ...(args.authority === undefined
            ? {}
            : { authority: args.authority }),
        }),
      ),
    );
    const binding = sha256HexSyncText(
      canonicalJson({
        taskId: api.taskId,
        conversationId: api.conversationId,
        callId: api.callId,
        input,
      }),
    );
    const route = { runId: input.runId, scopeKey };
    const hostId = evalSessionId(host.ownerId(), scopeKey);
    const call = createMainRpcCaller(execution.rpc);
    if (
      api.continuation !== undefined &&
      canonicalJson(api.continuation) !==
        canonicalJson({ kind: "eval", runId: route.runId, binding })
    )
      throw new Error(
        "Eval continuation conflicts with its original native invocation",
      );
    return {
      input,
      binding,
      route,
      hostId,
      call,
      rpc: execution.rpc,
      harness: host.harness(),
    };
  }
  const waiting = (runId: string, binding: string): ToolExecutionWait => ({
    wait: { kind: "receipt", key: runId, binding },
    continuation: { kind: "eval", runId, binding },
  });
  return {
    execute: async (args, api, context) => {
      const resuming = api.continuation !== undefined;
      const original = await invocation(args, api, context);
      const { harness, input, binding, route, hostId, call, rpc } = original;
      await api.retainContinuation(
        { kind: "eval", runId: route.runId, binding },
        (tx) =>
          bindEvalRun(tx, route.runId, binding, route, api.conversationId),
        context,
      );
      const consumed = await harness.snapshot(ReceiptDoc, route.runId, context);
      if (consumed?.result !== undefined)
        return formatEvalResult(
          evalRunResultSchema.parse(consumed.result),
          (digest) => call("blobstore.getBase64", [digest]),
        );
      let started: Awaited<ReturnType<typeof startDynamicCodeRun>>;
      try {
        // The admission outlives a lost start response: the same run is started again with it.
        started = await startDynamicCodeRun(rpc, input, {
          keepAdmissionOnFailure: true,
        });
      } catch (error) {
        // A host refusal before the first admission owns no kernel run. A
        // restored continuation may already own one, even without an ack.
        const refusal = !resuming
          ? nativeToolAdmissionRefusal(error, "eval", context)
          : undefined;
        if (refusal) return refusal;
        throw error;
      }
      if (started.admission.hostId !== hostId)
        throw new Error(
          "Eval admission named a session entity other than this owner's scope entity",
        );
      await api.commit(
        (tx) => recordEvalAdmission(tx, route.runId, started.started),
        context,
      );
      const { observer } = started;
      const observed = await observer.receipt();
      if (observed === null) {
        // Not terminal yet: a background task pulls the committed row and settles the parked call.
        await api.commit(
          (tx) => ensureEvalAwaitTask(tx, route.runId, host.awaiting),
          context,
        );
        return waiting(route.runId, binding);
      }
      const receipt = await retainObservedEvalReceipt(
        harness,
        api,
        route.runId,
        observed,
        host.acknowledgements,
        context,
      );
      await observer.release().catch(() => undefined);
      return formatEvalResult(receipt.result, (digest) => call("blobstore.getBase64", [digest]));
    },
    cancel: async (args, api, context) => {
      const { harness, binding, route, hostId, call, rpc } = await invocation(
        args,
        api,
        context,
      );
      const admission = await retainedEvalAdmission(
        harness,
        route.runId,
        context,
      );
      // An unstarted native tool owns no external run. Read-only inspection
      // must not manufacture a notebook or a new domain operation on abort.
      if (!admission) return { output: [] };
      await api.commit(
        (tx) =>
          bindEvalRun(tx, route.runId, binding, route, api.conversationId),
        context,
      );
      const observer = createDynamicCodeRunObserver(rpc, {
        hostId,
        runId: route.runId,
      });
      await observer.cancel();
      const observed = await observer.receipt();
      if (observed === null)
        throw new Error("Eval cancellation has no canonical terminal receipt");
      const receipt = evalResultReceiptSchema.parse(observed);
      await api.commit(
        (tx) => recordEvalReceiptAdmission(tx, route.runId, receipt),
        context,
      );
      await retainObservedEvalReceipt(
        harness,
        api,
        route.runId,
        receipt,
        host.acknowledgements,
        context,
      );
      await observer.release().catch(() => undefined);
      return formatEvalResult(receipt.result, (digest) => call("blobstore.getBase64", [digest]));
    },
  };
}
