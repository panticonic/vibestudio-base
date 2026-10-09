import { expect, it, vi, afterEach } from "vitest";
import { SpeechRuntime, decodeRecording } from "./runtime.js";
vi.mock("./artifacts.js", () => ({ prepareArtifacts: async () => "/unused" }));
vi.mock("./engine.js", () => ({
  engineSource: `
const { parentPort } = require("node:worker_threads");
parentPort.postMessage({ type: "ready" });
parentPort.on("message", (audio) => {
  parentPort.postMessage({ type: "progress", message: "started" });
  if (audio[0] === 0.5) throw new Error("original engine failure");
  if (audio[0] === 1) while (true) {}
  parentPort.postMessage({ type: "result", text: "hello", model: "whistle", language: "en" });
});
`,
}));
const owners: SpeechRuntime[] = [];
afterEach(async () => {
  await Promise.all(owners.splice(0).map((owner) => owner.stop()));
});
function owner() {
  const runtime = new SpeechRuntime("/unused");
  owners.push(runtime);
  return runtime;
}
function recording(value = 0) {
  const bytes = Buffer.alloc(640);
  for (let i = 0; i < 160; i++) bytes.writeFloatLE(value, i * 4);
  return {
    format: "pcm_f32le",
    sampleRate: 16000,
    audio: bytes.toString("base64"),
  } as const;
}
it("validates PCM before model preparation", () => {
  expect(decodeRecording(recording(0.25))[0]).toBe(0.25);
  expect(() => decodeRecording(recording(NaN))).toThrow("Invalid PCM sample");
  expect(() => decodeRecording(recording(2))).toThrow("Invalid PCM sample");
  expect(() => decodeRecording({ ...recording(), audio: "AAAA" })).toThrow(
    "length",
  );
});
it("serializes callers and reports resident readiness", async () => {
  const runtime = owner();
  expect(runtime.status()).toEqual({ ready: false });
  const events: string[] = [];
  await Promise.all([
    runtime.transcribe(recording(), new AbortController().signal, (event) =>
      events.push(`a:${event.type}`),
    ),
    runtime.transcribe(recording(), new AbortController().signal, (event) =>
      events.push(`b:${event.type}`),
    ),
  ]);
  expect(events).toEqual([
    "a:progress",
    "a:progress",
    "a:result",
    "b:progress",
    "b:result",
  ]);
  expect(runtime.status()).toEqual({ ready: true });
});
it("cancels and joins blocked inference before a queued caller can acquire the engine", async () => {
  const runtime = owner();
  const cancellation = new AbortController();
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = runtime.transcribe(
    recording(1),
    cancellation.signal,
    (event) => {
      if (event.type === "progress" && event.message === "started") started();
    },
  );
  const rejected = expect(first).rejects.toThrow("cancelled by caller");
  await running;
  const next = runtime.transcribe(
    recording(),
    new AbortController().signal,
    () => {},
  );
  cancellation.abort(new Error("cancelled by caller"));
  await rejected;
  await next;
  expect(runtime.status()).toEqual({ ready: true });
});
it("propagates original worker failures and retires its owner", async () => {
  const runtime = owner();
  await expect(
    runtime.transcribe(recording(0.5), new AbortController().signal, () => {}),
  ).rejects.toThrow("original engine failure");
  expect(runtime.status()).toEqual({ ready: false });
});
it("shutdown settles active and queued work", async () => {
  const runtime = owner();
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = runtime.transcribe(
    recording(1),
    new AbortController().signal,
    (event) => {
      if (event.type === "progress" && event.message === "started") started();
    },
  );
  const rejected = expect(first).rejects.toThrow("stopped");
  await running;
  const queued = runtime.prepare(new AbortController().signal, () => {});
  const queuedRejected = expect(queued).rejects.toThrow("stopped");
  await runtime.stop();
  await Promise.all([rejected, queuedRejected]);
  expect(runtime.status()).toEqual({ ready: false });
});

it("settles queued cancellation without interrupting another caller's inference", async () => {
  const runtime = owner();
  const active = new AbortController();
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = runtime.transcribe(recording(1), active.signal, (event) => {
    if (event.type === "progress" && event.message === "started") started();
  });
  const firstRejected = expect(first).rejects.toThrow("retire active");
  await running;
  const queued = new AbortController();
  const second = runtime.prepare(queued.signal, () => {
    throw new Error("queued work ran");
  });
  const rejected = expect(second).rejects.toThrow("cancel queued");
  queued.abort(new Error("cancel queued"));
  await rejected;
  expect(runtime.status()).toEqual({ ready: true });
  active.abort(new Error("retire active"));
  await firstRejected;
});
