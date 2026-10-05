import { useCallback, useEffect, useRef, useState } from "react";
import {
  SPEECH_MAX_PCM_BYTES,
  type SpeechEvent,
} from "@vibestudio/service-schemas/speech";

export interface SpeechRpc {
  call(target: string, method: string, args: unknown[]): Promise<unknown>;
  stream(
    target: string,
    method: string,
    args: unknown[],
    options?: { signal?: AbortSignal },
  ): Promise<Response>;
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
    "speech.transcribe",
    [{ format: "pcm_f32le", sampleRate: 16000, audio: btoa(binary) }],
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

async function readSpeechEvents(
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

type Capture = {
  abort: AbortController;
  context: AudioContext;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  blob?: Blob;
};
export function useDictation(
  rpc: SpeechRpc | undefined,
  scope: unknown,
  enabled: boolean,
  onTranscript: (text: string) => void,
) {
  const [phase, setPhase] = useState<
    | "idle"
    | "checking"
    | "offer"
    | "loading"
    | "ready"
    | "permission"
    | "recording"
    | "transcribing"
    | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const current = useRef<Capture | null>(null);
  const preparation = useRef<AbortController | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | undefined>();
  const [microphone, setMicrophone] = useState(false);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  const capable =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof OfflineAudioContext !== "undefined" &&
    !!rpc;
  useEffect(() => {
    if (!capable) return;
    let live = true;
    const devices = navigator.mediaDevices;
    const update = async () => {
      try {
        const available = (await devices.enumerateDevices()).some(
          (device) => device.kind === "audioinput",
        );
        if (live) setMicrophone(available);
      } catch {
        if (live) setMicrophone(false);
      }
    };
    void update();
    devices.addEventListener?.("devicechange", update);
    return () => {
      live = false;
      devices.removeEventListener?.("devicechange", update);
    };
  }, [capable]);
  const supported = capable && microphone;
  const release = useCallback((capture: Capture) => {
    if (capture.recorder) {
      capture.recorder.onstop = null;
      capture.recorder.onerror = null;
      if (capture.recorder.state !== "inactive") capture.recorder.stop();
    }
    capture.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    void capture.context.close().catch(() => {});
  }, []);
  const cancel = useCallback(() => {
    preparation.current?.abort();
    preparation.current = null;
    setLoadProgress(undefined);
    const capture = current.current;
    current.current = null;
    if (capture) {
      capture.abort.abort();
      release(capture);
    }
    setPhase("idle");
    setMessage("");
  }, [release]);
  useEffect(() => cancel, [scope, cancel]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  const busy =
    phase === "permission" || phase === "recording" || phase === "transcribing";
  useEffect(() => {
    if (phase === "idle") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [phase, cancel]);
  const fail = (capture: Capture, error: unknown) => {
    if (current.current !== capture) return;
    if (error instanceof Error && error.name === "NotFoundError") {
      setMicrophone(false);
      cancel();
      return;
    }
    if (!capture.blob) {
      current.current = null;
      release(capture);
    }
    setPhase("error");
    setMessage(
      error instanceof Error && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow access and try again."
        : error instanceof Error
          ? error.message
          : String(error),
    );
    if (capture.recorder) capture.recorder.onstop = null;
    capture.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  };
  const submit = async (capture: Capture) => {
    if (!rpc || !capture.blob || current.current !== capture) return;
    setPhase("transcribing");
    setMessage("Transcribing…");
    try {
      const text = await transcribeRecording(
        capture.blob,
        capture.context,
        rpc,
        capture.abort.signal,
        (value) => {
          if (current.current === capture) setMessage(value);
        },
      );
      if (current.current !== capture) return;
      callback.current(text);
      cancel();
    } catch (error) {
      if (!capture.abort.signal.aborted) fail(capture, error);
    }
  };
  const record = async () => {
    if (!enabled || !supported || current.current) return;
    const capture: Capture = {
      abort: new AbortController(),
      context: new AudioContext(),
    };
    current.current = capture;
    setPhase("permission");
    setMessage("Waiting for microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      capture.stream = stream;
      if (capture.abort.signal.aborted) {
        release(capture);
        return;
      }
      const recorder = new MediaRecorder(stream);
      capture.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        fail(
          capture,
          (event as Event & { error?: Error }).error ??
            new Error("The microphone could not record audio."),
        );
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          cancel();
          setPhase("error");
          setMessage("The microphone disconnected. Please try again.");
        };
      });
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        capture.blob = new Blob(chunks, { type: recorder.mimeType });
        void submit(capture);
      };
      recorder.start();
      setPhase("recording");
      setMessage("Recording · English · Up to one minute");
    } catch (error) {
      fail(capture, error);
    }
  };
  const start = async () => {
    if (!enabled || !supported || current.current || preparation.current)
      return;
    const operation = new AbortController();
    preparation.current = operation;
    setPhase("checking");
    setMessage("Checking voice input…");
    try {
      const status = (await rpc!.call("main", "speech.status", [])) as {
        ready: boolean;
      };
      if (preparation.current !== operation) return;
      preparation.current = null;
      if (status.ready) await record();
      else {
        setPhase("offer");
        setMessage(
          "Load voice input to get ready to speak. The model runs locally and stays ready for your next recording.",
        );
      }
    } catch (error) {
      if (preparation.current !== operation) return;
      preparation.current = null;
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const prepare = async () => {
    if (!rpc || !enabled || preparation.current) return;
    const operation = new AbortController();
    preparation.current = operation;
    setPhase("loading");
    setMessage("Preparing voice input…");
    setLoadProgress(undefined);
    try {
      const response = await rpc.stream("main", "speech.prepare", [], {
        signal: operation.signal,
      });
      let ready = false;
      await readSpeechEvents(response, operation.signal, (event) => {
        if (preparation.current !== operation) return;
        if (event.type === "ready") ready = true;
        else if (event.type === "progress") {
          setMessage(event.message);
          setLoadProgress(
            event.total && event.completed !== undefined
              ? (event.completed / event.total) * 100
              : undefined,
          );
        } else throw new Error("Invalid voice preparation response");
      });
      if (preparation.current !== operation) return;
      if (!ready)
        throw new Error(
          "Voice input preparation ended before the model was ready.",
        );
      preparation.current = null;
      setPhase("ready");
      setMessage("Voice input is ready");
    } catch (error) {
      if (preparation.current !== operation) return;
      preparation.current = null;
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  // This dismisses only a completed preparation notice, never active loading.
  // The ready model stays resident, and the microphone button remains available.
  useEffect(() => {
    if (phase !== "ready") return;
    const dismiss = setTimeout(cancel, 8000);
    return () => clearTimeout(dismiss);
  }, [phase, cancel]);
  return {
    supported,
    loadProgress,
    prepare,
    phase,
    message,
    busy,
    start,
    stop: () => current.current?.recorder?.stop(),
    cancel,
    retry: current.current?.blob
      ? () => {
          if (current.current) void submit(current.current);
        }
      : undefined,
  };
}
