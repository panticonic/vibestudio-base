import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SpeechRuntime } from "./runtime.js";
import type { SpeechEvent } from "@workspace/speech";

let retire: (() => Promise<void>) | undefined;
afterEach(async () => {
  await retire?.();
  retire = undefined;
});

// A real engine/model smoke. The runner's bound preserves diagnostics without
// defining a production deadline; the owner is joined before deleting its cache.
it("downloads once, reloads offline, and preserves long recordings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "whistle-smoke-"));
  let runtime = new SpeechRuntime(root);
  let restoreFetch: (() => void) | undefined;
  retire = async () => {
    await runtime.stop();
    restoreFetch?.();
    await rm(root, { recursive: true, force: true });
  };
  try {
    const wav = await readFile(new URL("./fixtures/jfk.wav", import.meta.url));
    let pcm: Buffer | undefined;
    for (let offset = 12; offset + 8 < wav.length; ) {
      const size = wav.readUInt32LE(offset + 4);
      if (wav.toString("ascii", offset, offset + 4) === "data") {
        pcm = wav.subarray(offset + 8, offset + 8 + size);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!pcm) throw new Error("Missing WAV PCM");
    const audio = Buffer.alloc(pcm.length * 2);
    for (let i = 0; i < pcm.length / 2; i++)
      audio.writeFloatLE(pcm.readInt16LE(2 * i) / 32768, i * 4);
    const signal = new AbortController().signal;
    await runtime.prepare(signal, () => {});
    expect(runtime.status()).toEqual({ ready: true });
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 1) {
        await runtime.stop();
        const offline = vi
          .spyOn(globalThis, "fetch")
          .mockRejectedValue(new Error("offline"));
        restoreFetch = () => offline.mockRestore();
        runtime = new SpeechRuntime(root);
        await runtime.prepare(signal, () => {});
      }
      const events: SpeechEvent[] = [];
      await runtime.transcribe(
        {
          format: "pcm_f32le",
          sampleRate: 16000,
          audio: (pass === 2
            ? Buffer.concat([audio, audio, audio, audio])
            : audio
          ).toString("base64"),
        },
        signal,
        (event) => events.push(event),
      );
      expect(events.at(-1)).toMatchObject({
        type: "result",
        model: "whistle",
        language: "en",
        text: expect.stringMatching(
          /ask not what your country can do for you/i,
        ),
      });
      if (pass === 2) {
        const result = events.at(-1);
        if (result?.type !== "result")
          throw new Error("Missing long-recording result");
        expect(
          result.text.match(/ask not what your country can do for you/gi),
        ).toHaveLength(4);
        expect(result.text).toMatch(/^And so/i);
      }
      expect(
        events.some(
          (event) =>
            event.type === "progress" && /Downloading/.test(event.message),
        ),
      ).toBe(false);
    }
  } finally {
    await retire();
    retire = undefined;
  }
}, 120000);
