// PCM plus base64 and RPC metadata fit the smallest transport's 8 MiB envelope.
export const SPEECH_MAX_PCM_BYTES = 4 * 1024 * 1024;
export const SPEECH_EXTENSION = "@workspace-extensions/speech";
export type SpeechRecording = {
  format: "pcm_f32le";
  sampleRate: 16000;
  audio: string;
};
export type SpeechEvent =
  | { type: "progress"; message: string; completed?: number; total?: number }
  | { type: "ready" }
  | { type: "result"; text: string; model: "whistle"; language: string };
