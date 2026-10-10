import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import type { LogEnvelope } from "@workspace/agentic-protocol";
import {
  observeChannelEvent,
  type ChannelObservationInput,
} from "./channel-observation.js";

const channelId = "channel:observation";
const target = "do:workers/workspace-source:GadWorkspaceDO:workspace";
const envelope: LogEnvelope = {
  logId: channelId,
  head: "main",
  seq: 3,
  envelopeId: "original:envelope" as LogEnvelope["envelopeId"],
  actor: { kind: "user", id: "user:original" },
  payloadKind: "message",
  payload: { content: "original accepted content" },
  annotations: {
    contentClass: "external",
    externalKeys: ["original:source"],
    agentHops: 2,
  },
  appendedAt: "2026-10-10T00:00:00.000Z",
  prevHash: "original:previous",
  hash: "original:hash",
};
function fixture(response: LogEnvelope | LogEnvelope[] = envelope, failure?: Error) {
  const responses=Array.isArray(response)?response:[response];
  const last=responses.at(-1)!;
  const append = vi.fn(async (_request: unknown) => {
    if (failure) throw failure;
    return {
      logId: channelId,
      head: "main",
      headSeq: last.seq,
      headHash: last.hash,
      envelopes: responses,
      published: [],
    };
  });
  const put = vi.fn(async (value: string) => ({
    digest: sha256HexSyncText(value),
    size: value.length,
  }));
  const rpc = schemaRpcMock({
    call: async (destination, method, args) => {
      if (destination === "main" && method === "workers.resolveService")
        return durableObjectServiceFixture(target, {
          source: "workers/workspace-source",
          className: "GadWorkspaceDO",
          objectKey: "workspace",
        });
      if (destination === "main" && method === "blobstore.putText")
        return put(String(args[0]));
      if (destination === target && method === "appendLogEvent")
        return append(args[0]);
      throw new Error(`Unexpected observer RPC ${destination}.${method}`);
    },
  });
  return { rpc, append, put };
}
function input(value = envelope): ChannelObservationInput {
  return {
    kind: "append",
    sequence: value.seq,
    envelopes: [value],
  };
}
describe("channel canonical observation", () => {
  it("mirrors an existing frozen prefix in one atomic append and verifies every acknowledgement",async()=>{
    const second={...envelope,seq:4,envelopeId:"second" as LogEnvelope["envelopeId"],prevHash:envelope.hash,hash:"second:hash"};
    const third={...second,seq:5,envelopeId:"third" as LogEnvelope["envelopeId"],prevHash:second.hash,hash:"third:hash"};
    const batch={kind:"append" as const,sequence:3,envelopes:[envelope,second,third]};
    const actual=fixture(batch.envelopes);
    await expect(observeChannelEvent(actual.rpc,channelId,batch)).resolves.toEqual({observedSequence:5,envelopeId:third.envelopeId,hash:third.hash});
    expect(actual.append).toHaveBeenCalledTimes(1);
    expect((actual.append.mock.calls[0]![0] as {events:unknown[]}).events).toHaveLength(3);
    for(const replies of [[envelope,third],[envelope,{...second,hash:"divergent"},third],[third,second,envelope]]) {
      const invalid=fixture(replies);
      await expect(observeChannelEvent(invalid.rpc,channelId,batch)).rejects.toThrow("acknowledgement differs");
      expect(invalid.append).toHaveBeenCalledTimes(1);
    }
    const invalid=fixture(batch.envelopes);
    await expect(observeChannelEvent(invalid.rpc,channelId,{...batch,envelopes:[envelope,{...second,prevHash:"divergent"}]})).rejects.toThrow("exact locally committed envelope");
    expect(invalid.append).not.toHaveBeenCalled();
  });

  it("mirrors the exact owner-local envelope without changing the captured publisher", async () => {
    const f = fixture();
    await expect(
      observeChannelEvent(f.rpc, channelId, input()),
    ).resolves.toEqual({
      observedSequence: 3,
      envelopeId: envelope.envelopeId,
      hash: envelope.hash,
    });
    expect(f.append).toHaveBeenCalledWith({
      logId: channelId,
      head: "main",
      logKind: "channel",
      idempotency: "exact",
      events: [
        {
          envelopeId: envelope.envelopeId,
          appendedAt: envelope.appendedAt,
          actor: envelope.actor,
          payloadKind: envelope.payloadKind,
          payload: envelope.payload,
          annotations: envelope.annotations,
        },
      ],
    });
    expect(f.put).not.toHaveBeenCalled();
    expect(envelope.actor.id).toBe("user:original");
  });
  it("rejects mismatched global acknowledgements before the owner can settle", async () => {
    for (const patch of [
      { seq: 4 },
      { envelopeId: "other" as LogEnvelope["envelopeId"] },
      { hash: "other" },
      { prevHash: "other" },
    ]) {
      const f = fixture({ ...envelope, ...patch });
      await expect(
        observeChannelEvent(f.rpc, channelId, input()),
      ).rejects.toThrow("acknowledgement differs");
    }
  });
  it("preserves the original observer failure without retry or publishing another event", async () => {
    const original = new Error("original global observer failure");
    const f = fixture(envelope, original);
    await expect(observeChannelEvent(f.rpc, channelId, input())).rejects.toBe(
      original,
    );
    expect(f.append).toHaveBeenCalledTimes(1);
  });
  it("rejects another local owner or cursor before any global observation", async () => {
    for (const patch of [
      { logId: "channel:other" },
      { seq: 4 },
      { head: "branch:other" },
    ]) {
      const f = fixture();
      await expect(
        observeChannelEvent(f.rpc, channelId, {
          ...input(),
          envelopes: [{ ...envelope, ...patch }],
        }),
      ).rejects.toThrow("exact locally committed envelope");
      expect(f.append).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
    }
  });
  it("passes the owning claim cancellation into global observation and joins its failure", async () => {
    const controller = new AbortController();
    const original = new Error("observer owner explicitly cancelled");
    let started!: () => void;
    const admitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let receivedSignal: AbortSignal | undefined;
    const rpc = schemaRpcMock({
      call: async (destination, method, _args, options) => {
        if (destination === "main" && method === "workers.resolveService")
          return durableObjectServiceFixture(target, {
            source: "workers/workspace-source",
            className: "GadWorkspaceDO",
            objectKey: "workspace",
          });
        if (destination === target && method === "appendLogEvent") {
          receivedSignal = options?.signal;
          started();
          await new Promise<void>((_resolve, reject) => {
            options!.signal!.addEventListener(
              "abort",
              () => reject(options!.signal!.reason),
              { once: true },
            );
          });
        }
        throw new Error(`Unexpected observer RPC ${destination}.${method}`);
      },
    });
    const owned = observeChannelEvent(
      rpc,
      channelId,
      input(),
      controller.signal,
    );
    void owned.catch(() => undefined);
    try {
      await admitted;
      expect(receivedSignal).toBe(controller.signal);
      controller.abort(original);
      await expect(owned).rejects.toBe(original);
    } finally {
      controller.abort(original);
      await owned.catch(() => undefined);
    }
  });
});
