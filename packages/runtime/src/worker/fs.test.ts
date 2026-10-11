import { describe, expect, it, vi } from "vitest";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";

describe("plain worker filesystem readiness", () => {
  it("rejects I/O before explicit initialization rather than stranding module evaluation", async () => {
    vi.resetModules();
    const { fs } = await import("./fs.js");
    await expect(fs.readFile("notes.md", "utf8")).rejects.toThrow(
      "Worker filesystem requires createWorkerRuntime(env) before I/O; Durable Objects use this.fs",
    );
    expect(fs.constants.R_OK).toBe(4);
  });

  it("uses the initialized owner's client and propagates its original failure", async () => {
    vi.resetModules();
    const { fs, _initFsWithRpc } = await import("./fs.js");
    const failure = new Error("owner disconnected");
    const call = vi
      .fn()
      .mockResolvedValueOnce("content")
      .mockRejectedValueOnce(failure);
    _initFsWithRpc(schemaRpcClientMock({ call }, "worker-fs-test"));
    await expect(fs.readFile("notes.md", "utf8")).resolves.toBe("content");
    await expect(fs.readFile("missing.md", "utf8")).rejects.toBe(failure);
    expect(call).toHaveBeenCalledWith("main", "fs.readFile", [
      "notes.md",
      "utf8",
    ], undefined);
  });
});
