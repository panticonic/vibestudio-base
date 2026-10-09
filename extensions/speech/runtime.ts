import { Worker } from "node:worker_threads";
import {
  SPEECH_MAX_PCM_BYTES,
  type SpeechRecording,
  type SpeechEvent,
} from "@workspace/speech";
import { prepareArtifacts } from "./artifacts.js";
import { engineSource } from "./engine.js";

type Pending = { resolve(): void; reject(error: Error): void };
export function decodeRecording(
  recording: SpeechRecording,
): Float32Array<ArrayBuffer> {
  if (
    !recording ||
    recording.format !== "pcm_f32le" ||
    recording.sampleRate !== 16000 ||
    typeof recording.audio !== "string" ||
    recording.audio.length > Math.ceil(SPEECH_MAX_PCM_BYTES / 3) * 4
  )
    throw new Error("Expected mono 16 kHz float32 PCM, up to 4 MiB");
  const bytes = Buffer.from(recording.audio, "base64");
  if (
    bytes.length < 640 ||
    bytes.length % 4 ||
    bytes.length > SPEECH_MAX_PCM_BYTES
  )
    throw new Error("Invalid PCM recording length");
  const audio = new Float32Array(bytes.length / 4);
  for (let i = 0; i < audio.length; i++) {
    const value = bytes.readFloatLE(4 * i);
    if (!Number.isFinite(value) || Math.abs(value) > 1)
      throw new Error("Invalid PCM sample");
    audio[i] = value;
  }
  return audio;
}
export class SpeechRuntime {
  private worker: Worker | null = null;
  private ready = false;
  private stopped = false;
  private pending: Pending | null = null;
  private emit: ((event: SpeechEvent) => void) | null = null;
  private tail: Promise<void> = Promise.resolve();
  private active: AbortController | null = null;
  constructor(private readonly root: string) {}
  status() {
    return { ready: this.ready && !this.stopped };
  }
  private async retire() {
    const worker = this.worker;
    this.ready = false;
    if (worker) {
      await worker.terminate();
      if (this.worker === worker) this.worker = null;
    }
  }
  private async load(signal: AbortSignal) {
    if (this.ready) return;
    const directory = await prepareArtifacts(this.root, signal, (message) =>
      this.emit?.({ type: "progress", message }),
    );
    signal.throwIfAborted();
    this.emit?.({ type: "progress", message: "Loading Whistle…" });
    const worker = new Worker(engineSource, {
      eval: true,
      execArgv: [],
      workerData: directory,
    });
    this.worker = worker;
    const loaded = new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
    worker.on("message", (event: SpeechEvent) => {
      if (event.type === "ready") {
        this.ready = true;
        this.pending?.resolve();
        this.pending = null;
      } else if (event.type === "progress") this.emit?.(event);
      else if (event.type === "result") {
        this.emit?.(event);
        this.pending?.resolve();
        this.pending = null;
      }
    });
    worker.on("error", (error) => {
      this.ready = false;
      this.pending?.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    worker.once("exit", (code) => {
      this.ready = false;
      this.pending?.reject(new Error(`Whistle worker exited (${code})`));
      this.pending = null;
      if (this.worker === worker) this.worker = null;
    });
    await loaded;
  }
  private run(
    signal: AbortSignal,
    emit: (event: SpeechEvent) => void,
    action: () => Promise<void>,
  ) {
    let started = false;
    const work = this.tail.then(async () => {
      started = true;
      signal.throwIfAborted();
      if (this.stopped) throw new Error("Speech extension has stopped");
      const controller = new AbortController();
      const cancellation = AbortSignal.any([signal, controller.signal]);
      this.active = controller;
      this.emit = emit;
      let retirement: Promise<void> | null = null;
      const abort = () => {
        retirement = this.retire();
      };
      cancellation.addEventListener("abort", abort, { once: true });
      try {
        await this.load(cancellation);
        cancellation.throwIfAborted();
        await action();
        cancellation.throwIfAborted();
      } catch (error) {
        await (retirement ?? this.retire());
        cancellation.throwIfAborted();
        throw error;
      } finally {
        await retirement;
        cancellation.removeEventListener("abort", abort);
        this.pending = null;
        this.emit = null;
        this.active = null;
      }
    });
    this.tail = work.catch(() => {});
    // A queued caller owns no engine. Its explicit cancellation settles now;
    // the serialized slot later observes that same signal and never starts work.
    return new Promise<void>((resolve, reject) => {
      const abortQueued = () => {
        if (!started) reject(signal.reason ?? new Error("Dictation cancelled"));
      };
      signal.addEventListener("abort", abortQueued, { once: true });
      if (signal.aborted) abortQueued();
      work
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abortQueued));
    });
  }
  prepare(signal: AbortSignal, emit: (event: SpeechEvent) => void) {
    return this.run(signal, emit, async () => {
      emit({ type: "ready" });
    });
  }
  async transcribe(
    recording: SpeechRecording,
    signal: AbortSignal,
    emit: (event: SpeechEvent) => void,
  ) {
    signal.throwIfAborted();
    const audio = decodeRecording(recording);
    return this.run(signal, emit, async () => {
      const done = new Promise<void>((resolve, reject) => {
        this.pending = { resolve, reject };
      });
      this.worker!.postMessage(audio, [audio.buffer]);
      await done;
    });
  }
  async stop() {
    this.stopped = true;
    this.active?.abort(new Error("Speech extension has stopped"));
    await this.retire();
    await this.tail;
  }
}
