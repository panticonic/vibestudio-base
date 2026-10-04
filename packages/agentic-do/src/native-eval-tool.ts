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
  evalMethods,
  evalRunResultSchema,
  evalStartInputSchema,
  evalStartResultSchema,
  evalResultReceiptSchema,
  type EvalCall,
} from "@vibestudio/service-schemas/eval";
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
  recordEvalAdmission,
  recordEvalReceiptAdmission,
  retainedEvalAdmission,
  retainObservedEvalReceipt,
  type NativeEvalAcknowledgements,
} from "./native-eval-receipts.js";

export interface NativeEvalHost {
  /** Already admitted owner Session; never opens/reenters from a tool invocation. */
  readonly harness: () => Harness;
  readonly acknowledgements: NativeEvalAcknowledgements;
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

/** Short admission/control calls; the EvalDO owns execution and its cancellation cleanup. */
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
          resultReceiver: { kind: "caller" },
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
    const call: EvalCall = <T>(method: string, params: unknown[]) =>
      execution.rpc.call<T>("main", method, params, {
        signal: context.abortSignal,
      });
    if (
      api.continuation !== undefined &&
      canonicalJson(api.continuation) !==
        canonicalJson({ kind: "eval", runId: route.runId, binding })
    )
      throw new Error(
        "Eval continuation conflicts with its original native invocation",
      );
    return { input, binding, route, call, harness: host.harness() };
  }
  const waiting = (runId: string, binding: string): ToolExecutionWait => ({
    wait: { kind: "receipt", key: runId, binding },
    continuation: { kind: "eval", runId, binding },
  });
  return {
    execute: async (args, api, context) => {
      const resuming = api.continuation !== undefined;
      const original = await invocation(args, api, context);
      const { harness, input, binding, route, call } = original;
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
          (digest) => call<string | null>("blobstore.getBase64", [digest]),
        );
      let response: unknown;
      try {
        response = await call<unknown>("eval.start", [input]);
      } catch (error) {
        // A host refusal before the first admission owns no EvalDO run. A
        // restored continuation may already own one, even without an ack.
        const refusal = !resuming
          ? nativeToolAdmissionRefusal(error, "eval", context)
          : undefined;
        if (refusal) return refusal;
        throw error;
      }
      const accepted = evalStartResultSchema.parse(response);
      await api.commit(
        (tx) => recordEvalAdmission(tx, route.runId, accepted),
        context,
      );
      const observed = await call<unknown>("eval.receipt", [route]);
      if (observed === null) return waiting(route.runId, binding);
      const receipt = await retainObservedEvalReceipt(
        harness,
        api,
        route.runId,
        observed,
        host.acknowledgements,
        context,
      );
      return formatEvalResult(receipt.result, (digest) => call<string | null>("blobstore.getBase64", [digest]));
    },
    cancel: async (args, api, context) => {
      const { harness, binding, route, call } = await invocation(
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
      if (!admission) return { content: [] };
      await api.commit(
        (tx) =>
          bindEvalRun(tx, route.runId, binding, route, api.conversationId),
        context,
      );
      evalMethods.cancel.returns.parse(
        await call<unknown>("eval.cancel", [route]),
      );
      const observed = await call<unknown>("eval.receipt", [route]);
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
      return formatEvalResult(receipt.result, (digest) => call<string | null>("blobstore.getBase64", [digest]));
    },
  };
}
