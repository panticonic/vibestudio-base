import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { useCallback, useEffect, useRef, useState } from "react";
import { SPEECH_EXTENSION } from "@workspace/speech";
import {
  readSpeechEvents,
  transcribeRecording,
  type SpeechRpc,
} from "@workspace/speech/transcribe";

export { transcribeRecording, type SpeechRpc };

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
      setMessage("Recording · Up to one minute");
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
      const status = (await rpc!.call("main", mainRpcMethods["extensions.invoke"], [
        SPEECH_EXTENSION,
        "status",
        [],
      ])) as {
        ready: boolean;
      };
      if (preparation.current !== operation) return;
      preparation.current = null;
      if (status.ready) await record();
      else {
        setPhase("offer");
        setMessage(
          "Prepare voice input to get ready to speak. Downloads once, then runs offline in this workspace.",
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
      const response = await rpc.stream(
        "main",
        mainRpcMethods["extensions.invokeStream"],
        [SPEECH_EXTENSION, "prepare", []],
        {
          signal: operation.signal,
        },
      );
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
