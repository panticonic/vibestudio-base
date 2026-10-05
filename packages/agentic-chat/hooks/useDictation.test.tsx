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
            controller.enqueue(
              encode.encode('{"type":"progress","message":"Load'),
            );
            controller.enqueue(
              encode.encode('ing…"}\n{"type":"result","text":"Hello."}\n'),
            );
            controller.close();
          },
        }),
      ),
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
      progress,
    ),
  ).toBe("Hello.");
  expect(progress).toHaveBeenCalledWith("Loading…");
  expect(stream).toHaveBeenCalledWith(
    "main",
    "speech.transcribe",
    [{ format: "pcm_f32le", sampleRate: 16000, audio: expect.any(String) }],
    { signal },
  );
  const args = stream.mock.calls[0] as unknown as [
    string,
    string,
    [{ audio: string }],
  ];
  const audio = Uint8Array.from(atob(args[2][0].audio), (c) => c.charCodeAt(0));
  expect(new DataView(audio.buffer).getFloat32(0, true)).toBe(0.25);
});
it("stops a late microphone grant after cancellation and releases the audio context", async () => {
  let grant!: (stream: MediaStream) => void;
  const permission = new Promise<MediaStream>((resolve) => {
    grant = resolve;
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(() => permission),
      enumerateDevices: vi.fn(async () => [{ kind: "audioinput" }]),
    },
  });
  vi.stubGlobal("MediaRecorder", class {});
  vi.stubGlobal("OfflineAudioContext", class {});
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    "AudioContext",
    class {
      close = close;
    },
  );
  const onTranscript = vi.fn();
  const { result, unmount } = renderHook(() =>
    useDictation(
      { stream: vi.fn(), call: vi.fn(async () => ({ ready: true })) },
      "chat",
      true,
      onTranscript,
    ),
  );
  await act(async () => {});
  let work!: Promise<void>;
  await act(async () => {
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

function devices(available = true) {
  const getUserMedia = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: Object.assign(new EventTarget(), {
      getUserMedia,
      enumerateDevices: vi.fn(async () =>
        available ? [{ kind: "audioinput" }] : [],
      ),
    }),
  });
  vi.stubGlobal("MediaRecorder", class {});
  vi.stubGlobal("AudioContext", class {});
  vi.stubGlobal("OfflineAudioContext", class {});
  return getUserMedia;
}
it("hides dictation when no audio input device exists", async () => {
  const capture = devices(false);
  const rpc = { stream: vi.fn(), call: vi.fn() };
  const { result } = renderHook(() => useDictation(rpc, "chat", true, vi.fn()));
  await act(async () => {});
  expect(result.current.supported).toBe(false);
  await act(async () => result.current.start());
  expect(capture).not.toHaveBeenCalled();
  expect(rpc.call).not.toHaveBeenCalled();
});
it("offers explicit preparation before capture, reports progress, and leaves ready recording to the user", async () => {
  const capture = devices();
  let events!: ReadableStreamDefaultController<Uint8Array>;
  const rpc = {
    call: vi.fn(async () => ({ ready: false })),
    stream: vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              events = controller;
            },
          }),
        ),
    ),
  };
  const { result } = renderHook(() => useDictation(rpc, "chat", true, vi.fn()));
  await act(async () => {});
  await act(async () => result.current.start());
  expect(result.current.phase).toBe("offer");
  expect(rpc.stream).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  let preparation!: Promise<void>;
  await act(async () => {
    preparation = result.current.prepare();
  });
  expect(result.current.phase).toBe("loading");
  expect(result.current.busy).toBe(false);
  await act(async () =>
    events.enqueue(
      new TextEncoder().encode(
        '{"type":"progress","message":"Loading voice model…","completed":2,"total":4}\n',
      ),
    ),
  );
  expect(result.current.loadProgress).toBe(50);
  await act(async () => {
    events.enqueue(new TextEncoder().encode('{"type":"ready"}\n'));
    events.close();
    await preparation;
  });
  expect(result.current.phase).toBe("ready");
  expect(capture).not.toHaveBeenCalled();
  act(() => result.current.cancel());
  expect(result.current.phase).toBe("idle");
});
it("ignores a readiness response after dismissing the preparation prompt", async () => {
  const capture = devices();
  let answer!: (value: unknown) => void;
  const rpc = {
    stream: vi.fn(),
    call: vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }),
    ),
  };
  const { result } = renderHook(() => useDictation(rpc, "chat", true, vi.fn()));
  await act(async () => {});
  let checking!: Promise<void>;
  act(() => {
    checking = result.current.start();
  });
  act(() => result.current.cancel());
  await act(async () => {
    answer({ ready: true });
    await checking;
  });
  expect(capture).not.toHaveBeenCalled();
  expect(result.current.phase).toBe("idle");
});

it("cancels and releases an in-flight model preparation stream", async () => {
  devices();
  const retired = vi.fn();
  const rpc = {
    call: vi.fn(async () => ({ ready: false })),
    stream: vi.fn(
      async () => new Response(new ReadableStream({ cancel: retired })),
    ),
  };
  const { result } = renderHook(() => useDictation(rpc, "chat", true, vi.fn()));
  await act(async () => {});
  await act(async () => result.current.start());
  let work!: Promise<void>;
  await act(async () => {
    work = result.current.prepare();
  });
  await act(async () => {
    result.current.cancel();
    await work;
  });
  expect(retired).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("idle");
});

it("auto-dismisses only the completed ready notice while leaving the microphone available", async () => {
  devices();
  vi.useFakeTimers();
  try {
    const rpc = {
      call: vi.fn(async () => ({ ready: false })),
      stream: vi.fn(async () => new Response('{"type":"ready"}\n')),
    };
    const { result } = renderHook(() =>
      useDictation(rpc, "chat", true, vi.fn()),
    );
    await act(async () => {});
    await act(async () => result.current.start());
    await act(async () => result.current.prepare());
    expect(result.current.phase).toBe("ready");
    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.phase).toBe("idle");
    expect(result.current.supported).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("makes dictation available when a microphone is connected", async () => {
  devices(false);
  const { result } = renderHook(() =>
    useDictation({ call: vi.fn(), stream: vi.fn() }, "chat", true, vi.fn()),
  );
  await act(async () => {});
  expect(result.current.supported).toBe(false);
  vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([
    { kind: "audioinput" } as MediaDeviceInfo,
  ]);
  await act(async () => {
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  expect(result.current.supported).toBe(true);
});
