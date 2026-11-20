import { bytesToBase64 } from "@vibestudio/rpc";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { rpc } from "@workspace/runtime";
import {
  SPEECH_EXTENSION,
  SPEECH_MAX_PCM_BYTES,
  SPEECH_MIN_PCM_SAMPLES,
  SPEECH_SAMPLE_RATE,
  SPEECH_WINDOW_SAMPLES,
  type SpeechRecording,
  type SpeechTranscribeOptions,
} from "@workspace/speech";
import { readSpeechEvents } from "@workspace/speech/transcribe";
import type {
  DictationCapture,
  DictationRequest,
  DictationTranscript,
} from "../offline-dictation/types.js";

export function bindOfflineDictation(
  input: Omit<DictationRequest, "operationId">,
  samples: Float32Array | null,
  signal = new AbortController().signal,
) {
  const request = { ...input, operationId: crypto.randomUUID() };
  const { operationId, mode } = request;
  const recording: DictationCapture["recording"] = !samples
    ? "absent"
    : samples.byteLength > SPEECH_MAX_PCM_BYTES
      ? "too-large"
      : samples.length < SPEECH_MIN_PCM_SAMPLES
        ? "too-short"
        : "valid";
  const pcm =
    recording === "valid" && samples ? new Float32Array(samples) : null;
  const validity = pcm?.some(
    (sample) => !Number.isFinite(sample) || Math.abs(sample) > 1,
  )
    ? "invalid-sample"
    : recording;
  const measurements: Omit<DictationCapture, "ready"> = {
    recording: validity,
    durationMs: samples ? (samples.length * 1000) / SPEECH_SAMPLE_RATE : null,
    windowed:
      validity === "valid" &&
      pcm !== null &&
      pcm.length > SPEECH_WINDOW_SAMPLES,
  };
  let observed: DictationCapture | undefined;
  let dispatched = false;

  return {
    request,
    services: {
      dictationCaptureRead: {
        async inspect(id: string): Promise<DictationCapture> {
          if (id !== operationId)
            throw new Error("Inspect only the caller's assigned recording");
          const status: unknown = await rpc.call(
            "main",
            mainRpcMethods["extensions.invoke"],
            [SPEECH_EXTENSION, "status", []],
            { signal },
          );
          if (
            !status ||
            typeof status !== "object" ||
            !("ready" in status) ||
            typeof status.ready !== "boolean"
          )
            throw new Error("Speech extension returned an invalid status");
          observed = { ...measurements, ready: status.ready };
          return { ...observed };
        },
      },
      dictationTranscription: {
        async run(id: string): Promise<DictationTranscript> {
          if (
            id !== operationId ||
            mode !== "transcribe" ||
            dispatched ||
            !observed?.ready ||
            observed.recording !== "valid" ||
            !pcm
          )
            throw new Error(
              "Transcribe only the authorized recording with a ready local worker",
            );
          dispatched = true;
          const bytes = new Uint8Array(pcm.byteLength);
          const view = new DataView(bytes.buffer);
          for (let offset = 0; offset < pcm.length; offset++)
            view.setFloat32(
              offset * Float32Array.BYTES_PER_ELEMENT,
              pcm[offset]!,
              true,
            );
          const recording: SpeechRecording = {
            format: "pcm_f32le",
            sampleRate: SPEECH_SAMPLE_RATE,
            audio: bytesToBase64(bytes),
          };
          const options: SpeechTranscribeOptions = { requireReady: true };
          const response = await rpc.stream(
            "main",
            mainRpcMethods["extensions.invokeStream"],
            [SPEECH_EXTENSION, "transcribe", [recording, options]],
            { signal },
          );
          let transcript: DictationTranscript | undefined;
          await readSpeechEvents(response, signal, (event) => {
            if (event.type === "progress" && !transcript) return;
            if (
              event.type !== "result" ||
              transcript ||
              event.model !== "whistle" ||
              typeof event.text !== "string" ||
              typeof event.language !== "string"
            )
              throw new Error(
                "Speech extension returned an invalid transcript stream",
              );
            transcript = {
              text: event.text,
              model: event.model,
              language: event.language,
            };
          });
          if (!transcript)
            throw new Error("Speech extension returned no complete transcript");
          return transcript;
        },
      },
    },
  };
}
