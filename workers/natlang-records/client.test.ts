import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { AuthenticatedCaller } from "@vibestudio/rpc";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import {
  createNatlangRecordsClient,
  type NatlangRecordsRpcCaller,
} from "@workspace/natlang-records/client";
import type { NatlangOwner, NatlangRecordInput } from "@workspace/natlang-records/contract";
import { NatlangRecordsDO } from "./NatlangRecordsDO.js";

const OWNER: NatlangOwner = { kind: "headless", objectKey: "run-host", agentRef: "agent:alpha" };

class Records extends NatlangRecordsDO {
  protected override get caller(): AuthenticatedCaller | null {
    return { callerId: "client-test", callerKind: "worker" } as AuthenticatedCaller;
  }
}

/** An RPC caller that resolves the service and dispatches straight to the object under test. */
async function connect(): Promise<{ rpc: NatlangRecordsRpcCaller }> {
  const { instance } = await createTestDO(Records);
  const receiver = instance as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const rpc = {
    async call(targetId: string, method: { name: string }, args: unknown[]) {
      if (targetId === "main") {
        expect(method.name).toBe("workers.resolveService");
        expect(args[0]).toBe("vibestudio.natlang.v1");
        return { kind: "durable-object", targetId: "do:natlang", source: "", className: "", objectKey: "" };
      }
      return receiver[method.name]!(...args);
    },
    async streamReadable(
      _targetId: string,
      method: { name: string },
      args: unknown[],
      options?: { signal?: AbortSignal },
    ) {
      const response = (await receiver[method.name]!(...args)) as Response;
      const source = response.body!.getReader();
      const signal = options?.signal;
      // Like a transport, an abort errors the stream the caller reads and releases the source.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener(
            "abort",
            () => {
              controller.error(signal.reason ?? new Error("aborted"));
              void source.cancel(signal.reason);
            },
            { once: true },
          );
        },
        async pull(controller) {
          const chunk = await source.read();
          if (chunk.done) controller.close();
          else controller.enqueue(chunk.value);
        },
        cancel: (reason) => source.cancel(reason),
      });
      return { status: response.status, body };
    },
  } as unknown as NatlangRecordsRpcCaller;
  return { rpc };
}

describe("createNatlangRecordsClient", () => {
  it("round-trips records, feedback and tune examples", async () => {
    const { rpc } = await connect();
    const client = createNatlangRecordsClient(rpc);
    const text = JSON.stringify("hello");
    const hash = sha256HexSyncText(text);
    const input: NatlangRecordInput = {
      owner: OWNER,
      runId: "run-1",
      blobs: { [hash]: text },
      record: {
        version: "natlang.calls/1",
        call_id: "call-1",
        parent_call_id: null,
        parent_action_index: null,
        task_id: "t",
        program_id: "p",
        program_root: "/programs/p",
        definition: { id: "d", name: "classify", source: "classify.nl", key: "k", interface: "i", site: "named" },
        executor: { kind: "agent", model_id: "m" },
        inputs: { text: { complete: true, hash, bytes: text.length } },
        output: { complete: true, hash, bytes: text.length },
        outcome: "done",
        detail: "",
        started_at: "2026-01-01T00:00:00.000Z",
        ended_at: "2026-01-01T00:00:01.000Z",
        cost: { model_requests: 1, tokens_in: 1, tokens_out: 1, wall_ms: 5 },
        approach: { hash: null },
        events: null,
      },
    };
    expect(await client.record(input)).toEqual({ recordId: "call-1" });
    expect(await client.listCalls({ runId: "run-1" })).toHaveLength(1);
    expect((await client.getCall("call-1"))?.record?.call_id).toBe("call-1");
    expect(await client.getValue(hash)).toBe(text);
    const { example } = await client.feedback({ callId: "call-1", verdict: "good" });
    expect(example).toMatchObject({ function: "classify.nl", expected: "hello" });
    expect((await client.tuneExamples()).count).toBe(1);
  });

  it("subscribes, receives published events, and closes with an acknowledged unsubscribe", async () => {
    const { rpc } = await connect();
    const client = createNatlangRecordsClient(rpc);
    expect(await client.liveInterest()).toEqual({ subscribed: false });
    const subscription = await client.subscribeLive({ agentRef: "agent:alpha" });
    expect(await client.liveInterest()).toEqual({ subscribed: true });
    const event = { type: "call_start", callId: "c1" };
    expect(await client.publishLive({ owner: OWNER, events: [event] })).toEqual({ delivered: 1 });
    const iterator = subscription.deliveries[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ owner: OWNER, events: [event] });
    await subscription.close();
    expect((await iterator.next()).done).toBe(true);
    expect(await client.liveInterest()).toEqual({ subscribed: false });
  });

  it("ends the subscription when its signal aborts", async () => {
    const { rpc } = await connect();
    const client = createNatlangRecordsClient(rpc);
    const controller = new AbortController();
    const subscription = await client.subscribeLive({}, { signal: controller.signal });
    controller.abort();
    const iterator = subscription.deliveries[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(true);
    expect(await client.liveInterest()).toEqual({ subscribed: false });
  });

  it("needs streamReadable only for live subscriptions", async () => {
    const { rpc } = await connect();
    const client = createNatlangRecordsClient({ call: rpc.call.bind(rpc) });
    expect(await client.liveInterest()).toEqual({ subscribed: false });
    await expect(client.subscribeLive()).rejects.toThrow(/streamReadable/);
  });
});
