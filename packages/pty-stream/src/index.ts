/**
 * The terminal attach stream of the Base `shell` extension.
 *
 * A PTY session records its output as raw bytes addressed by a monotonic byte
 * cursor. An attacher receives a framed binary stream:
 *
 * - `hello`: where the retained window starts and ends, the session's epoch,
 *   the attachment id used for acknowledgements, and the current size;
 * - `reset`: the session's scrollback was cleared (or the attacher's position
 *   belongs to an earlier epoch): clear the terminal, then continue;
 * - `gap`: bytes `[from, to)` were trimmed before this attacher read them;
 * - `data`: output bytes starting at cursor `at` (never decoded server-side,
 *   so UTF-8 sequences split across chunks stay byte-correct);
 * - `exit`: the process exited; the stream ends after it.
 *
 * Flow control is per attachment and counted in bytes of `data` payloads, the
 * same unit on both sides: the client acknowledges bytes it has consumed
 * (`acknowledge(sessionId, attachId, bytes)`), and the PTY pauses while any
 * attachment has more than {@link FLOW_HIGH_WATERMARK_BYTES} unacknowledged.
 */

export const FLOW_HIGH_WATERMARK_BYTES = 128 * 1024;
export const FLOW_LOW_WATERMARK_BYTES = 16 * 1024;
/** Clients acknowledge in batches of at least this many bytes (or when idle). */
export const ACK_BATCH_BYTES = 8 * 1024;

/** Where an attacher left off: resume after `cursor` within `epoch`. */
export interface PtyStreamPosition {
  epoch: number;
  cursor: number;
}

export interface PtyAttachOptions {
  /** Resume after this position. Omitted: replay the whole retained window. */
  after?: PtyStreamPosition;
  /**
   * The attacher's terminal size. When given, the session is resized to it
   * after the replay and, if the size did not change, the foreground process
   * still receives SIGWINCH, so full-screen programs redraw cleanly.
   */
  size?: { cols: number; rows: number };
}

export interface PtyStreamHello {
  kind: "hello";
  attachId: string;
  epoch: number;
  /** Oldest retained byte. */
  start: number;
  /** Next byte to be written. */
  cursor: number;
  alive: boolean;
  cols: number;
  rows: number;
}

export type PtyStreamEvent =
  | PtyStreamHello
  | { kind: "data"; at: number; bytes: Uint8Array }
  | { kind: "reset"; epoch: number; cursor: number }
  | { kind: "gap"; from: number; to: number }
  | { kind: "exit"; code: number | null; signal?: string };

const KIND_HELLO = 1;
const KIND_DATA = 2;
const KIND_RESET = 3;
const KIND_GAP = 4;
const KIND_EXIT = 5;
const HEADER_BYTES = 5;
const CURSOR_BYTES = 8;
/** A single frame never exceeds this; larger data is split by the encoder. */
export const MAX_FRAME_PAYLOAD_BYTES = 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function frame(kind: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, kind);
  view.setUint32(1, payload.byteLength);
  out.set(payload, HEADER_BYTES);
  return out;
}

function jsonFrame(kind: number, value: unknown): Uint8Array {
  return frame(kind, encoder.encode(JSON.stringify(value)));
}

/** Encode one event as one or more frames (data larger than a frame is split). */
export function encodePtyStreamEvent(event: PtyStreamEvent): Uint8Array[] {
  switch (event.kind) {
    case "hello": {
      const { kind: _kind, ...body } = event;
      return [jsonFrame(KIND_HELLO, body)];
    }
    case "reset":
      return [jsonFrame(KIND_RESET, { epoch: event.epoch, cursor: event.cursor })];
    case "gap":
      return [jsonFrame(KIND_GAP, { from: event.from, to: event.to })];
    case "exit":
      return [
        jsonFrame(KIND_EXIT, {
          code: event.code,
          ...(event.signal ? { signal: event.signal } : {}),
        }),
      ];
    case "data": {
      const frames: Uint8Array[] = [];
      const step = MAX_FRAME_PAYLOAD_BYTES - CURSOR_BYTES;
      for (let offset = 0; offset < event.bytes.byteLength; offset += step) {
        const part = event.bytes.subarray(offset, offset + step);
        const payload = new Uint8Array(CURSOR_BYTES + part.byteLength);
        new DataView(payload.buffer).setFloat64(0, event.at + offset);
        payload.set(part, CURSOR_BYTES);
        frames.push(frame(KIND_DATA, payload));
      }
      return frames;
    }
  }
}

export class PtyStreamProtocolError extends Error {
  readonly code = "EPROTO";
}

function parseJson(payload: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(decoder.decode(payload));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PtyStreamProtocolError("Malformed terminal stream control frame");
  }
  return value as Record<string, unknown>;
}

function num(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PtyStreamProtocolError(`Terminal stream frame is missing ${key}`);
  }
  return value;
}

/** Incremental decoder: push arbitrary chunks, get whole events. */
export class PtyStreamDecoder {
  #buffer = new Uint8Array(0);

  push(chunk: Uint8Array): PtyStreamEvent[] {
    const merged = new Uint8Array(this.#buffer.byteLength + chunk.byteLength);
    merged.set(this.#buffer, 0);
    merged.set(chunk, this.#buffer.byteLength);
    const events: PtyStreamEvent[] = [];
    let offset = 0;
    while (merged.byteLength - offset >= HEADER_BYTES) {
      const view = new DataView(merged.buffer, merged.byteOffset + offset);
      const kind = view.getUint8(0);
      const length = view.getUint32(1);
      if (length > MAX_FRAME_PAYLOAD_BYTES) {
        throw new PtyStreamProtocolError(`Terminal stream frame of ${length} bytes exceeds the limit`);
      }
      if (merged.byteLength - offset - HEADER_BYTES < length) break;
      const payload = merged.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + length);
      events.push(this.#decode(kind, payload));
      offset += HEADER_BYTES + length;
    }
    this.#buffer = merged.slice(offset);
    return events;
  }

  /** The stream ended: a partial frame left over is a protocol error. */
  end(): void {
    if (this.#buffer.byteLength > 0) {
      throw new PtyStreamProtocolError("Terminal stream ended inside a frame");
    }
  }

  #decode(kind: number, payload: Uint8Array): PtyStreamEvent {
    switch (kind) {
      case KIND_DATA: {
        if (payload.byteLength < CURSOR_BYTES) {
          throw new PtyStreamProtocolError("Terminal stream data frame has no cursor");
        }
        const at = new DataView(payload.buffer, payload.byteOffset).getFloat64(0);
        return { kind: "data", at, bytes: payload.slice(CURSOR_BYTES) };
      }
      case KIND_HELLO: {
        const body = parseJson(payload);
        const attachId = body["attachId"];
        if (typeof attachId !== "string" || !attachId) {
          throw new PtyStreamProtocolError("Terminal stream hello has no attachment id");
        }
        return {
          kind: "hello",
          attachId,
          epoch: num(body, "epoch"),
          start: num(body, "start"),
          cursor: num(body, "cursor"),
          alive: body["alive"] === true,
          cols: num(body, "cols"),
          rows: num(body, "rows"),
        };
      }
      case KIND_RESET: {
        const body = parseJson(payload);
        return { kind: "reset", epoch: num(body, "epoch"), cursor: num(body, "cursor") };
      }
      case KIND_GAP: {
        const body = parseJson(payload);
        return { kind: "gap", from: num(body, "from"), to: num(body, "to") };
      }
      case KIND_EXIT: {
        const body = parseJson(payload);
        const code = body["code"];
        const signal = body["signal"];
        return {
          kind: "exit",
          code: typeof code === "number" ? code : null,
          ...(typeof signal === "string" ? { signal } : {}),
        };
      }
      default:
        throw new PtyStreamProtocolError(`Unknown terminal stream frame kind ${kind}`);
    }
  }
}

/**
 * Read a whole attach response body as events. Rejects on malformed frames.
 * Aborting `signal` cancels the body (the server drops the attachment) and
 * ends the iteration without an error.
 */
export async function* readPtyStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<PtyStreamEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new PtyStreamDecoder();
  let ended = false;
  let failed = false;
  let failure: unknown;
  let sourceFailed = false;
  let sourceFailure: unknown;
  let cancellation: Promise<void> | undefined;
  let cancellationFailed = false;
  let cancellationFailure: unknown;
  // reader.cancel on an already errored source rejects with that same source
  // failure. It is not an independent retirement failure.
  void reader.closed.catch((error: unknown) => {
    sourceFailed = true;
    sourceFailure = error;
  });
  const cancel = () => {
    cancellation ??= reader.cancel(signal?.reason).catch((error: unknown) => {
      if (sourceFailed && error === sourceFailure) return;
      cancellationFailed = true;
      cancellationFailure = error;
    });
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) {
      cancel();
      return;
    }
    for (;;) {
      const { value, done } = await reader.read();
      if (signal?.aborted) return;
      if (done) {
        ended = true;
        decoder.end();
        return;
      }
      for (const event of decoder.push(value)) {
        if (signal?.aborted) return;
        yield event;
      }
    }
  } catch (error) {
    if (!signal?.aborted || error !== signal.reason) {
      failed = true;
      failure = error;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!ended) cancel();
    await cancellation;
    reader.releaseLock();
    const failures = [...(failed ? [failure] : []), ...(cancellationFailed ? [cancellationFailure] : [])];
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Terminal stream and retirement failed", { cause: failures[0] });
  }
}

/**
 * Track an attacher's position across reattachments. Feed every event to
 * `apply`; pass `resumeAfter()` as `after` when attaching again, so the next
 * stream continues exactly after the last byte this client consumed.
 */
export class PtyStreamCursor {
  #position: PtyStreamPosition | null = null;

  apply(event: PtyStreamEvent): void {
    switch (event.kind) {
      case "hello":
        // A fresh attach replays from `start` unless it resumes.
        if (!this.#position || this.#position.epoch !== event.epoch) {
          this.#position = { epoch: event.epoch, cursor: event.start };
        }
        return;
      case "reset":
        this.#position = { epoch: event.epoch, cursor: event.cursor };
        return;
      case "gap":
        if (this.#position) this.#position = { ...this.#position, cursor: event.to };
        return;
      case "data":
        if (this.#position) {
          this.#position = { ...this.#position, cursor: event.at + event.bytes.byteLength };
        }
        return;
      case "exit":
        return;
    }
  }

  resumeAfter(): PtyStreamPosition | undefined {
    return this.#position ? { ...this.#position } : undefined;
  }

  forget(): void {
    this.#position = null;
  }
}

/**
 * Batches acknowledgements of consumed bytes. Call `consumed(n)` once the
 * bytes of a data event have been processed (for example in xterm's write
 * callback); acknowledgements go out in order, in batches of
 * {@link ACK_BATCH_BYTES}. Because that batch is smaller than
 * {@link FLOW_LOW_WATERMARK_BYTES}, an unsent remainder can never hold the PTY
 * paused, so no idle flush is needed; `flush()` exists for orderly detach.
 */
export class PtyStreamAcknowledger {
  #pending = 0;
  #sending: Promise<void> = Promise.resolve();

  constructor(
    private readonly send: (bytes: number) => Promise<void>,
    private readonly onError: (error: unknown) => void
  ) {}

  consumed(bytes: number): void {
    if (bytes <= 0) return;
    this.#pending += bytes;
    if (this.#pending >= ACK_BATCH_BYTES) this.flush();
  }

  flush(): void {
    const bytes = this.#pending;
    if (bytes === 0) return;
    this.#pending = 0;
    this.#sending = this.#sending.then(() => this.send(bytes)).catch(this.onError);
  }

  /** Settles once every acknowledgement sent so far has been delivered. */
  settled(): Promise<void> {
    return this.#sending;
  }
}
