import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  status: vi.fn(),
  vcsStatus: vi.fn(),
  resolveRepository: vi.fn(),
  readFile: vi.fn(),
  listFiles: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  extensions: { status: native.status },
  vcs: {
    status: native.vcsStatus,
    resolveRepository: native.resolveRepository,
    readFile: native.readFile,
    listFiles: native.listFiles,
  },
}));
import { bindExtensionRelease } from "./workflow.js";

const assignment = {
  contextId: "owner",
  name: "@workspace-extensions/git-bridge",
  source: "extensions/git-bridge",
  method: "status",
  goal: "Compare the protected source and active release",
};
describe("independent extension observations", () => {
  beforeEach(() => {
    native.status.mockReset();
    native.status.mockResolvedValue({
      name: assignment.name,
      source: assignment.source,
      status: "ready",
      activeEv: "v1",
      identity: { entityId: "native" },
      methods: ["status"],
      pendingApproval: null,
      lastError: null,
      availableUpdate: null,
    });
  });
  it("reads runtime before source and permits truthful refreshes", async () => {
    const bound = bindExtensionRelease(assignment);
    const first = await bound.services.extensionReleaseRead.runtime(
      bound.request.operationId,
    );
    native.status.mockResolvedValueOnce({
      name: assignment.name,
      source: assignment.source,
      status: "building",
      activeEv: "v2",
      methods: [],
      pendingApproval: null,
      lastError: null,
      availableUpdate: null,
    });
    const second = await bound.services.extensionReleaseRead.runtime(
      bound.request.operationId,
    );
    expect(first.activeEv).toBe("v1");
    expect(second.activeEv).toBe("v2");
    expect(second.status).toBe("building");
    expect(native.status).toHaveBeenCalledTimes(2);
  });
  it("refuses foreign operations without invoking native status", async () => {
    const bound = bindExtensionRelease(assignment);
    await expect(
      bound.services.extensionReleaseRead.runtime("foreign"),
    ).rejects.toThrow("assigned extension runtime");
    expect(native.status).not.toHaveBeenCalled();
  });
  it("allows source and runtime observations to overlap without a scripted read order", async () => {
    let release!: (value: unknown) => void;
    native.vcsStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    native.resolveRepository.mockResolvedValue({ repositoryId: "repo" });
    native.readFile.mockResolvedValue({
      content: {
        kind: "text",
        text: JSON.stringify({
          name: assignment.name,
          vibestudio: {
            extension: {
              activationEvents: ["onInvoke"],
              methodAuthority: { status: {} },
            },
          },
        }),
      },
      contentHash: "native-manifest",
    });
    native.listFiles.mockResolvedValue({ files: [], nextCursor: null });
    const bound = bindExtensionRelease(assignment);
    const source = bound.services.extensionReleaseRead.source(
      bound.request.operationId,
    );
    const runtime = await bound.services.extensionReleaseRead.runtime(
      bound.request.operationId,
    );
    expect(runtime.name).toBe(assignment.name);
    release({
      workingHead: { kind: "event", eventId: "head" },
      mainEventId: "head",
    });
    const observed = await source;
    expect(observed.name).toBe(assignment.name);
    expect(observed.working?.hash).toBe("native-manifest");
    expect(observed.operationId).toBe(runtime.operationId);
  });
  it("retains native identity checks and original read failures", async () => {
    const bound = bindExtensionRelease(assignment);
    native.status.mockResolvedValueOnce({
      name: "other",
      source: assignment.source,
    });
    await expect(
      bound.services.extensionReleaseRead.runtime(bound.request.operationId),
    ).rejects.toThrow("different extension");
    const error = new Error("native status unavailable");
    native.status.mockRejectedValueOnce(error);
    await expect(
      bound.services.extensionReleaseRead.runtime(bound.request.operationId),
    ).rejects.toBe(error);
  });
});
