import { beforeEach, expect, it, vi } from "vitest";
import { bindOfflineDictation } from "./index.js";

const { call, stream } = vi.hoisted(() => ({ call: vi.fn(), stream: vi.fn() }));
vi.mock("@workspace/runtime", () => ({ rpc: { call, stream } }));
beforeEach(() => vi.resetAllMocks());

const assignment = {
  goal: "Review the caller's audio",
  mode: "transcribe",
  presentation: "verbatim",
} as const;

it("does not dispatch audio for an invalid recording or unready worker", async () => {
  call
    .mockResolvedValueOnce({ ready: true })
    .mockResolvedValueOnce({ ready: false });
  const invalid = new Float32Array(160).fill(NaN);
  const bad = bindOfflineDictation(assignment, invalid);
  await expect(
    bad.services.dictationCaptureRead.inspect(bad.request.operationId),
  ).resolves.toMatchObject({
    ready: true,
    recording: "invalid-sample",
  });
  await expect(
    bad.services.dictationTranscription.run(bad.request.operationId),
  ).rejects.toThrow("authorized recording");

  const cold = bindOfflineDictation(assignment, new Float32Array(480_001));
  await expect(
    cold.services.dictationCaptureRead.inspect(cold.request.operationId),
  ).resolves.toMatchObject({
    ready: false,
    recording: "valid",
    windowed: true,
  });
  await expect(
    cold.services.dictationTranscription.run(cold.request.operationId),
  ).rejects.toThrow("ready local worker");
  expect(stream).not.toHaveBeenCalled();
});

it("seals assigned samples and accepts one complete local transcript", async () => {
  call.mockResolvedValue({ ready: true });
  const transcript = { text: "draft words", language: "en", model: "whistle" };
  stream.mockResolvedValue(
    new Response(JSON.stringify({ ...transcript, type: "result" }) + "\n"),
  );
  const input = new Float32Array(160);
  input[0] = 0.5;
  const { request, services } = bindOfflineDictation(assignment, input);
  input.fill(0);
  await expect(
    services.dictationCaptureRead.inspect("foreign-id"),
  ).rejects.toThrow("assigned");
  await services.dictationCaptureRead.inspect(request.operationId);
  await expect(
    services.dictationTranscription.run(request.operationId),
  ).resolves.toEqual(transcript);
  const parameters = stream.mock.calls[0]![2][2];
  expect(parameters[1]).toEqual({ requireReady: true });
  expect(Buffer.from(parameters[0].audio, "base64").readFloatLE(0)).toBe(0.5);
  await expect(
    services.dictationTranscription.run(request.operationId),
  ).rejects.toThrow("authorized recording");
});
