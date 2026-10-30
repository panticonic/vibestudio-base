import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { readChannelSubscriptionRecords } from "@vibestudio/service-schemas/channel";
import type { RpcCaller } from "@vibestudio/rpc";
import type { RpcCallerLike } from "@vibestudio/shared/workspaceServiceRpc";
import {
  NATLANG_RECORDS_SERVICE_PROTOCOL,
  natlangRecordsRpcMethods,
  type CallDetail,
  type CallSummary,
  type NatlangAnnotateInput,
  type NatlangBeginInput,
  type NatlangFeedbackInput,
  type NatlangFeedbackResult,
  type NatlangImportExamplesInput,
  type NatlangListCallsFilter,
  type NatlangLiveDelivery,
  type NatlangLiveFilter,
  type NatlangLiveSubscribed,
  type NatlangPublishLiveInput,
  type NatlangRecordInput,
  type NatlangRecordResult,
  type NatlangTuneExamplesInput,
  type NatlangTuneExamplesResult,
} from "./contract.js";

/**
 * An RPC caller. Live subscriptions are a response stream, so they also need
 * `streamReadable` (every runtime's `rpc` has it; a caller without it can use
 * every other method).
 */
export type NatlangRecordsRpcCaller = RpcCallerLike & Partial<Pick<RpcCaller, "streamReadable">>;

/** A live subscription: deliveries as they are published, until it is closed. */
export interface NatlangLiveSubscription {
  readonly subscriptionId: string;
  /** Ends when the subscription is closed, the signal aborts, or the stream is lost; a lost stream rejects. */
  readonly deliveries: AsyncIterable<NatlangLiveDelivery>;
  /** Acknowledged end of the subscription; deliveries finish. */
  close(): Promise<void>;
}

export interface NatlangRecordsClient {
  begin(input: NatlangBeginInput): Promise<void>;
  progress(callId: string, events: string): Promise<void>;
  discard(callId: string): Promise<void>;
  record(input: NatlangRecordInput): Promise<NatlangRecordResult>;
  listCalls(filter?: NatlangListCallsFilter): Promise<CallSummary[]>;
  getCall(callId: string): Promise<CallDetail | null>;
  getValue(hash: string): Promise<string | null>;
  annotate(input: NatlangAnnotateInput): Promise<void>;
  feedback(input: NatlangFeedbackInput): Promise<NatlangFeedbackResult>;
  importExamples(
    input: NatlangImportExamplesInput,
  ): Promise<{ added: number; updated: number; unchanged: number }>;
  tuneExamples(input?: NatlangTuneExamplesInput): Promise<NatlangTuneExamplesResult>;
  /** Whether anything subscribes: ask once per eval cell, publish live events only when true. */
  liveInterest(): Promise<{ subscribed: boolean }>;
  publishLive(input: NatlangPublishLiveInput): Promise<{ delivered: number }>;
  subscribeLive(
    filter?: NatlangLiveFilter,
    options?: { signal?: AbortSignal },
  ): Promise<NatlangLiveSubscription>;
}

/** Typed client over any RPC caller: panel, worker, or eval `rpc`. */
export function createNatlangRecordsClient(rpc: NatlangRecordsRpcCaller): NatlangRecordsClient {
  const service = createDurableObjectServiceClient(
    rpc,
    NATLANG_RECORDS_SERVICE_PROTOCOL,
    natlangRecordsRpcMethods,
  );
  return {
    begin: (input) => service.call("begin", input),
    progress: (callId, events) => service.call("progress", { callId, events }),
    discard: (callId) => service.call("discard", { callId }),
    record: (input) => service.call("record", input),
    listCalls: (filter) => service.call("listCalls", filter ?? {}),
    getCall: (callId) => service.call("getCall", { callId }),
    getValue: (hash) => service.call("getValue", { hash }),
    annotate: (input) => service.call("annotate", input),
    feedback: (input) => service.call("feedback", input),
    importExamples: (input) => service.call("importExamples", input),
    tuneExamples: (input) => service.call("tuneExamples", input ?? {}),
    liveInterest: () => service.call("liveInterest"),
    publishLive: (input) => service.call("publishLive", input),
    async subscribeLive(filter, options) {
      if (!rpc.streamReadable)
        throw new Error("Live subscriptions need an RPC caller with streamReadable");
      const target = await service.resolve();
      const controller = new AbortController();
      const outer = options?.signal;
      const onOuter = () => controller.abort(outer?.reason);
      outer?.addEventListener("abort", onOuter, { once: true });
      if (outer?.aborted) onOuter();
      const release = () => outer?.removeEventListener("abort", onOuter);
      try {
        const response = await rpc.streamReadable(
          target.targetId,
          natlangRecordsRpcMethods.subscribeLive,
          [filter ?? {}],
          { signal: controller.signal },
        );
        const records = readChannelSubscriptionRecords<NatlangLiveSubscribed, NatlangLiveDelivery>(
          response,
        )[Symbol.asyncIterator]();
        const first = await records.next();
        if (first.done || first.value.kind !== "subscribed") {
          await records.return?.();
          throw new Error("Live subscription did not open with an acknowledgement");
        }
        const { subscriptionId } = first.value.result;
        const deliveries = (async function* () {
          try {
            for (;;) {
              const next = await records.next();
              if (next.done) return;
              if (next.value.kind === "message") yield next.value.payload;
            }
          } catch (error) {
            // Closing the subscription is a normal end, not a lost stream.
            if (controller.signal.aborted) return;
            throw error;
          } finally {
            release();
            await records.return?.();
          }
        })();
        return {
          subscriptionId,
          deliveries,
          async close() {
            try {
              await service.call("unsubscribeLive", { subscriptionId });
            } finally {
              controller.abort();
            }
          },
        };
      } catch (error) {
        release();
        throw error;
      }
    },
  };
}
