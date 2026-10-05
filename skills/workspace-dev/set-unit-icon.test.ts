import { beforeEach, describe, expect, it, vi } from "vitest";
import { vcsEditInputSchema } from "@vibestudio/service-schemas/vcs";
import { setUnitIcon } from "./set-unit-icon.js";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  resolveRepository: vi.fn(),
  readFile: vi.fn(),
  edit: vi.fn(),
  exists: vi.fn(),
  readAsset: vi.fn(),
  readdir: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  contextId: "ctx:test",
  vcs: {
    status: mocks.status,
    resolveRepository: mocks.resolveRepository,
    readFile: mocks.readFile,
    edit: mocks.edit,
  },
  fs: {
    exists: mocks.exists,
    readFile: mocks.readAsset,
    readdir: mocks.readdir,
  },
}));
const head = { kind: "application", applicationId: "application:before" };
const manifest = {
  name: "@workspace-panels/inbox",
  dependencies: { react: "^19.0.0" },
  vibestudio: {
    title: "Inbox",
    icon: "💬",
    authority: { requests: [], provides: [] },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.status.mockResolvedValue({ workingHead: head });
  mocks.resolveRepository.mockResolvedValue({ repositoryId: "repo:inbox" });
  mocks.readFile.mockImplementation(async ({ file }) =>
    file.path === "package.json"
      ? {
          repositoryId: "repo:inbox",
          fileId: "file:manifest",
          content: { kind: "text", text: JSON.stringify(manifest) },
        }
      : null,
  );
  mocks.exists.mockResolvedValue(true);
  mocks.readAsset.mockResolvedValue(
    '<svg stroke="currentColor" viewBox="0 0 24 24"/>',
  );
  mocks.edit.mockImplementation(async (input) => {
    vcsEditInputSchema.parse(input);
    return {
      workingHead: { kind: "application", applicationId: "application:after" },
    };
  });
});

describe("setUnitIcon", () => {
  it.each([
    "panels/inbox",
    "workers/inbox",
    "apps/inbox",
    "extensions/inbox",
    "about/inbox",
  ])(
    "materializes a catalog icon and manifest atomically for %s",
    async (repoPath) => {
      const result = await setUnitIcon({ repoPath, icon: "lucide:orbit" });
      expect(mocks.edit).toHaveBeenCalledTimes(1);
      const edit = mocks.edit.mock.calls[0]![0];
      expect(edit.expectedWorkingHead).toEqual(head);
      expect(edit.changes).toHaveLength(2);
      const written = JSON.parse(edit.changes[0].edits[0].text);
      expect(written).toEqual({
        ...manifest,
        vibestudio: { ...manifest.vibestudio, icon: "./assets/icon.svg" },
      });
      expect(edit.changes[1]).toMatchObject({
        kind: "file-create",
        path: "assets/icon.svg",
        content: { kind: "text", text: expect.stringContaining("#268CA3") },
      });
      expect(result).toMatchObject({
        icon: "./assets/icon.svg",
        files: ["package.json", "assets/icon.svg"],
        preparation: {
          publication: "unchanged",
          workingHead: { applicationId: "application:after" },
        },
      });
    },
  );

  it("replaces existing artwork by file identity in the same edit", async () => {
    const read = mocks.readFile.getMockImplementation()!;
    mocks.readFile.mockImplementation(async (input) =>
      input.file.path === "assets/icon.svg"
        ? {
            repositoryId: "repo:inbox",
            fileId: "file:icon",
            content: { kind: "text", text: "old" },
          }
        : read(input),
    );
    await setUnitIcon({ repoPath: "panels/inbox", icon: "brand:git" });
    expect(mocks.edit.mock.calls[0]![0].changes[1]).toMatchObject({
      kind: "content-replace",
      fileId: "file:icon",
      content: { text: expect.stringContaining("#F05032") },
    });
  });

  it("sets an emoji without touching the previous artwork", async () => {
    await setUnitIcon({ repoPath: "panels/inbox", icon: "🎯" });
    expect(mocks.edit.mock.calls[0]![0].changes).toHaveLength(1);
    expect(mocks.exists).not.toHaveBeenCalled();
  });

  it("checks an existing local asset at the same working state", async () => {
    const read = mocks.readFile.getMockImplementation()!;
    mocks.readFile.mockImplementation(async (input) =>
      input.file.path === "custom.png"
        ? {
            repositoryId: "repo:inbox",
            fileId: "file:icon",
            content: { kind: "bytes", base64: "AAAA" },
          }
        : read(input),
    );
    await setUnitIcon({ repoPath: "panels/inbox", icon: "./custom.png" });
    expect(mocks.readFile).toHaveBeenCalledWith({
      state: head,
      repositoryId: "repo:inbox",
      file: { kind: "path", path: "custom.png" },
    });
    expect(mocks.edit.mock.calls[0]![0].changes).toHaveLength(1);
  });

  it("rejects a missing asset before any mutation", async () => {
    await expect(
      setUnitIcon({ repoPath: "panels/inbox", icon: "./missing.svg" }),
    ).rejects.toThrow("Icon asset not found");
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("rejects an oversized custom asset before any mutation", async () => {
    const read = mocks.readFile.getMockImplementation()!;
    mocks.readFile.mockImplementation(async (input) =>
      input.file.path === "huge.svg"
        ? {
            repositoryId: "repo:inbox",
            fileId: "file:icon",
            content: { kind: "text", text: "x".repeat(1024 * 1024 + 1) },
          }
        : read(input),
    );
    await expect(
      setUnitIcon({ repoPath: "panels/inbox", icon: "./huge.svg" }),
    ).rejects.toThrow("exceeds");
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("rejects nonexistent catalog artwork before any mutation with discovery evidence", async () => {
    mocks.exists.mockResolvedValue(false);
    mocks.readdir.mockResolvedValue(["orbit.svg"]);
    await expect(
      setUnitIcon({ repoPath: "panels/inbox", icon: "lucide:orbt" }),
    ).rejects.toMatchObject({
      code: "project_icon_invalid",
      errorData: { suggestions: ["lucide:orbit"] },
    });
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it.each(["orbit", "./../icon.svg", "https://example.com/icon.svg"])(
    "rejects invalid authoring input %s before mutation",
    async (icon) => {
      await expect(
        setUnitIcon({ repoPath: "panels/inbox", icon }),
      ).rejects.toThrow("vibestudio.icon");
      expect(mocks.edit).not.toHaveBeenCalled();
    },
  );

  it("propagates a concurrent working-head rejection without retrying", async () => {
    const conflict = new Error("working head changed");
    mocks.edit.mockRejectedValue(conflict);
    await expect(
      setUnitIcon({ repoPath: "panels/inbox", icon: "🎯" }),
    ).rejects.toBe(conflict);
    expect(mocks.edit).toHaveBeenCalledTimes(1);
  });
});
