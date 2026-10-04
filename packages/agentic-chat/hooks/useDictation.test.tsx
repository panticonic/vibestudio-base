// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { transcribeRecording, useDictation } from "./useDictation";

afterEach(() => vi.unstubAllGlobals());
it("resamples supplied audio and reads progress across RPC chunk boundaries", async () => {
  const close = vi.fn(async () => {});
  class Context {
    close = close;
    decodeAudioData = vi.fn(async () => ({ duration: 0.02 }));
  }
  class Offline {
    destination = {};
    createBufferSource() {
      return { buffer: null, connect() {}, start() {} };
    }
    async startRendering() {
      return { getChannelData: () => new Float32Array(320).fill(0.25) };
    }
  }
  vi.stubGlobal("OfflineAudioContext", Offline);
  const stream = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            const encode = new TextEncoder();
            controller.enqueue(encode.encode('{"type":"progress","message":"Load'));
            controller.enqueue(encode.encode('ing…"}\n{"type":"result","text":"Hello."}\n'));
            controller.close();
          },
        })
      )
  );
  const progress = vi.fn();
  const signal = new AbortController().signal;
  const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob;
  expect(
    await transcribeRecording(
      blob,
      new Context() as unknown as AudioContext,
      { stream },
      signal,
      progress
    )
  ).toBe("Hello.");
  expect(progress).toHaveBeenCalledWith("Loading…");
  expect(stream).toHaveBeenCalledWith(
    "main",
    "speech.transcribe",
    [{ format: "pcm_f32le", sampleRate: 16000, audio: expect.any(String) }],
    { signal }
  );
  const args = stream.mock.calls[0] as unknown as [string, string, [{ audio: string }]];
  const audio = Uint8Array.from(atob(args[2][0].audio), (c) => c.charCodeAt(0));
  expect(new DataView(audio.buffer).getFloat32(0, true)).toBe(0.25);
});
it("stops a late microphone grant after cancellation and releases the audio context", async () => {
  let grant!: (stream: MediaStream) => void;
  const permission = new Promise<MediaStream>((resolve) => {
    grant = resolve;
  });
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(() => permission) },
  });
  vi.stubGlobal("MediaRecorder", class {});
  vi.stubGlobal("OfflineAudioContext", class {});
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    "AudioContext",
    class {
      close = close;
    }
  );
  const onTranscript = vi.fn();
  const { result, unmount } = renderHook(() =>
    useDictation({ stream: vi.fn() }, "chat", true, onTranscript)
  );
  let work!: Promise<void>;
  act(() => {
    work = result.current.start();
  });
  expect(result.current.phase).toBe("permission");
  act(() => result.current.cancel());
  const stop = vi.fn();
  await act(async () => {
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await work;
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalled();
  expect(result.current.phase).toBe("idle");
  expect(onTranscript).not.toHaveBeenCalled();
  unmount();
});
