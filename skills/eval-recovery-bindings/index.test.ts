import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { beforeEach, expect, it, vi } from "vitest";
import { bindEvalRecovery } from "./index.js";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@workspace/runtime", () => ({
  contextId: "test-context",
  rpc: { call },
}));
const text = "Completed test write";
const digest = sha256HexSyncText(text);
const entry = {
  type: "blob-text.observation",
  receipt: {
    protocol: "blob-text-observation.v1",
    method: "putText",
    digest,
    contentDigest: digest,
    size: text.length,
    lineCount: 1,
  },
};
function bind(truncated = false, entries: Record<string, unknown>[] = [entry]) {
  return bindEvalRecovery({
    goal: "Recover the assigned effect",
    contextId: "test-context",
    runId: "eval:original",
    expectedText: text,
    allowReadback: true,
    result: {
      success: false,
      operationJournal: {
        protocol: "workspace-operations.v1",
        entries,
        truncated,
      },
    },
  });
}
beforeEach(() => vi.resetAllMocks());

it("retains a failed eval's completed native receipt and pins one readback", async () => {
  call.mockResolvedValue(text);
  const { request, services } = bind();
  await expect(
    services.evalRecoveryReadback.read(request.operationId, digest),
  ).rejects.toThrow("native receipt");
  await expect(
    services.evalRecoveryJournal.observe(request.operationId),
  ).resolves.toMatchObject({
    cell: "failed",
    runId: "eval:original",
    journal: "complete",
    expectedDigest: digest,
    stores: [{ digest, contentDigest: digest, size: text.length }],
  });
  await expect(
    services.evalRecoveryReadback.read(request.operationId, "f".repeat(64)),
  ).rejects.toThrow("native receipt");
  await expect(
    services.evalRecoveryReadback.read(request.operationId, digest),
  ).resolves.toEqual({
    digest,
    observedDigest: digest,
    size: text.length,
  });
  await services.evalRecoveryReadback.read(request.operationId, digest);
  expect(call).toHaveBeenCalledTimes(1);
});

it.each([
  [true, [entry]],
  [false, [entry, entry]],
] as const)(
  "withholds readback for truncated or duplicate native receipts",
  async (truncated, entries) => {
    const { request, services } = bind(truncated, [...entries]);
    await services.evalRecoveryJournal.observe(request.operationId);
    await expect(
      services.evalRecoveryReadback.read(request.operationId, digest),
    ).rejects.toThrow("native receipt");
    expect(call).not.toHaveBeenCalled();
  },
);
