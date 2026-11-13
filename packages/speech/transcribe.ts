/**
 * Speech-to-text through the workspace speech extension, independent of any
 * UI framework: decode a recording, resample to 16 kHz mono PCM, and stream it
 * to `@workspace-extensions/speech` `transcribe`.
 */
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  SPEECH_MAX_PCM_BYTES,
  SPEECH_EXTENSION,
  type SpeechEvent,
} from "./index.js";

export interface SpeechRpc {
  call: import("@vibestudio/rpc").RpcCaller["call"];
  stream: import("@vibestudio/rpc").RpcCaller["stream"];
}

export async function transcribeRecording(
  blob: Blob,
  context: AudioContext,
  rpc: Pick<SpeechRpc, "stream">,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<string> {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  signal.throwIfAborted();
  const length = Math.ceil(decoded.duration * 16000);
  if (length < 160) throw new Error("Record a little longer before stopping.");
  // A 4 MiB PCM recording plus base64 and the RPC envelope fits the 8 MiB
  // Iroh frame contract, including remote and mobile callers.
  if (length * 4 > SPEECH_MAX_PCM_BYTES)
    throw new Error("Please keep each dictation under one minute.");
  const renderer = new OfflineAudioContext(1, length, 16000);
  const source = renderer.createBufferSource();
  source.buffer = decoded;
  source.connect(renderer.destination);
  source.start();
  const audio = (await renderer.startRendering()).getChannelData(0);
  signal.throwIfAborted();
  const bytes = new Uint8Array(length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < length; i++)
    view.setFloat32(i * 4, Math.max(-1, Math.min(1, audio[i]!)), true);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const response = await rpc.stream(
    "main",
    mainRpcMethods["extensions.invokeStream"],
    [
      SPEECH_EXTENSION,
      "transcribe",
      [{ format: "pcm_f32le", sampleRate: 16000, audio: btoa(binary) }],
    ],
    { signal },
  );
  const transcript: { text?: string } = {};
  await readSpeechEvents(response, signal, (event) => {
    if (event.type === "progress" && typeof event.message === "string")
      progress(event.message);
    else if (event.type === "result" && typeof event.text === "string")
      transcript.text = event.text;
    else throw new Error("Invalid dictation response");
  });
  if (transcript.text === undefined)
    throw new Error("Dictation ended without a complete transcript.");
  const text = transcript.text;
  if (!text.trim())
    throw new Error(
      "No speech detected. Try speaking closer to the microphone.",
    );
  return text;
}

export async function readSpeechEvents(
  response: Response,
  signal: AbortSignal,
  consume: (event: SpeechEvent) => void,
) {
  if (!response.ok || !response.body)
    throw new Error(`Voice input failed (${response.status}).`);
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        consume(JSON.parse(buffer.slice(0, end)) as SpeechEvent);
        buffer = buffer.slice(end + 1);
      }
    }
    signal.throwIfAborted();
    if (buffer.trim())
      throw new Error("Voice input ended with an incomplete response.");
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

