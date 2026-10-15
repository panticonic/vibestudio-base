import { describe, expect, it, vi } from "vitest";
import {
  ACK_BATCH_BYTES,
  encodePtyStreamEvent,
  MAX_FRAME_PAYLOAD_BYTES,
  PtyStreamAcknowledger,
  PtyStreamCursor,
  PtyStreamDecoder,
  PtyStreamProtocolError,
  readPtyStream,
  type PtyStreamEvent,
} from "./index.js";

const hello: PtyStreamEvent = {
  kind: "hello",
  attachId: "a1",
  epoch: 2,
  start: 10,
  cursor: 20,
  alive: true,
  cols: 80,
  rows: 24,
};

describe("readPtyStream ownership", () => {
  it("joins held cancellation before settling an aborted reader and releases its lock", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const cancel = vi.fn(() => held);
    const body = new ReadableStream<Uint8Array>({ cancel });
    const owner = new AbortController();
    const stream = readPtyStream(body, owner.signal);
    let settled = false;
    const next = stream.next().then((value) => { settled = true; return value; });
    const reason = new Error("detached");
    owner.abort(reason);
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledWith(reason);
    expect(settled).toBe(false);
    expect(body.locked).toBe(true);
    release();
    expect(await next).toEqual({ done: true, value: undefined });
    expect(body.locked).toBe(false);
  });

  it("preserves cancellation failures and releases the reader", async () => {
    const failure = new Error("source disposal failed");
    const body = new ReadableStream<Uint8Array>({ cancel: () => Promise.reject(failure) });
    const owner = new AbortController();
    const stream = readPtyStream(body, owner.signal);
    const next = stream.next();
    owner.abort(new Error("detach"));
    await expect(next).rejects.toBe(failure);
    expect(body.locked).toBe(false);
  });

  it("cancels early iterator return and retains the original source error exactly once", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(encodePtyStreamEvent(hello)[0]!),
      cancel,
    });
    const stream = readPtyStream(body);
    expect((await stream.next()).value).toEqual(hello);
    await stream.return();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    const sourceFailure = new Error("source broke");
    const errored = new ReadableStream<Uint8Array>({ start: (controller) => controller.error(sourceFailure) });
    await expect(readPtyStream(errored).next()).rejects.toBe(sourceFailure);
    expect(errored.locked).toBe(false);
  });
});

function concat(frames: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(frames.reduce((n, f) => n + f.byteLength, 0));
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.byteLength;
  }
  return out;
}

describe("pty stream framing", () => {
  it("round-trips every event kind across arbitrary chunk boundaries", () => {
    const events: PtyStreamEvent[] = [
      hello,
      { kind: "gap", from: 3, to: 10 },
      { kind: "data", at: 10, bytes: new Uint8Array([0xe2, 0x94, 0x80, 0x41]) },
      { kind: "reset", epoch: 3, cursor: 14 },
      { kind: "exit", code: null, signal: "SIGHUP" },
    ];
    const wire = concat(events.flatMap(encodePtyStreamEvent));
    const decoder = new PtyStreamDecoder();
    const decoded: PtyStreamEvent[] = [];
    for (let i = 0; i < wire.byteLength; i += 3) decoded.push(...decoder.push(wire.subarray(i, i + 3)));
    decoder.end();
    expect(decoded).toEqual(events);
  });

  it("splits large data into frames with consecutive cursors", () => {
    const bytes = new Uint8Array(MAX_FRAME_PAYLOAD_BYTES + 100).fill(7);
    const frames = encodePtyStreamEvent({ kind: "data", at: 5, bytes });
    expect(frames.length).toBe(2);
    const decoded = new PtyStreamDecoder().push(concat(frames));
    expect(decoded.map((e) => (e.kind === "data" ? [e.at, e.bytes.byteLength] : null))).toEqual([
      [5, MAX_FRAME_PAYLOAD_BYTES - 8],
      [5 + MAX_FRAME_PAYLOAD_BYTES - 8, 108],
    ]);
  });

  it("rejects truncated streams and unknown frames", () => {
    const decoder = new PtyStreamDecoder();
    decoder.push(encodePtyStreamEvent(hello)[0]!.subarray(0, 4));
    expect(() => decoder.end()).toThrow(PtyStreamProtocolError);
    expect(() => new PtyStreamDecoder().push(new Uint8Array([9, 0, 0, 0, 0]))).toThrow(
      PtyStreamProtocolError
    );
  });
});

describe("PtyStreamCursor", () => {
  it("resumes after the last consumed byte and follows resets and gaps", () => {
    const cursor = new PtyStreamCursor();
    expect(cursor.resumeAfter()).toBeUndefined();
    cursor.apply(hello);
    expect(cursor.resumeAfter()).toEqual({ epoch: 2, cursor: 10 });
    cursor.apply({ kind: "data", at: 10, bytes: new Uint8Array(5) });
    expect(cursor.resumeAfter()).toEqual({ epoch: 2, cursor: 15 });
    cursor.apply({ ...hello, start: 12 }); // reattach in the same epoch keeps the position
    expect(cursor.resumeAfter()).toEqual({ epoch: 2, cursor: 15 });
    cursor.apply({ kind: "gap", from: 15, to: 30 });
    expect(cursor.resumeAfter()).toEqual({ epoch: 2, cursor: 30 });
    cursor.apply({ kind: "reset", epoch: 3, cursor: 40 });
    expect(cursor.resumeAfter()).toEqual({ epoch: 3, cursor: 40 });
  });
});

describe("PtyStreamAcknowledger", () => {
  it("acknowledges consumed bytes in order, in batches", async () => {
    const send = vi.fn(async (_bytes: number) => {});
    const acks = new PtyStreamAcknowledger(send, (error) => {
      throw error;
    });
    acks.consumed(ACK_BATCH_BYTES - 1);
    expect(send).not.toHaveBeenCalled();
    acks.consumed(2);
    acks.consumed(5);
    acks.flush();
    await acks.settled();
    expect(send.mock.calls.map(([n]) => n)).toEqual([ACK_BATCH_BYTES + 1, 5]);
  });

  it("reports a failed acknowledgement", async () => {
    const onError = vi.fn();
    const acks = new PtyStreamAcknowledger(async () => {
      throw new Error("gone");
    }, onError);
    acks.consumed(ACK_BATCH_BYTES);
    await acks.settled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "gone" }));
  });
});
