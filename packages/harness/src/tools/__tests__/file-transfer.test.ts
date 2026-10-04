import { executeTool, toolResultDetails } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import { createCopyFileTool, createMoveFileTool } from "../file-transfer.js";
import type { ToolFileTransferVcs } from "../tool-vcs.js";

const working = { kind: "event" as const, eventId: "event:working" };
const next = {
  kind: "application" as const,
  applicationId: "application:next",
};

function fixture(
  options: { missing?: boolean; failure?: Error; producedFileId?: string } = {},
) {
  const status = vi.fn(async () => ({
    contextId: "context:1",
    committed: working,
    workingHead: working,
    clean: false,
    mainEventId: "event:main",
    mainRelation: "ahead" as const,
    workingCounts: { applications: 1, workUnits: 1, changes: 1 },
    integrating: [],
  }));
  const resolveRepository = vi.fn(
    async (input: Parameters<ToolFileTransferVcs["resolveRepository"]>[0]) => ({
      state: input.state,
      repositoryId: `repository:${input.repoPath}`,
      repoPath: input.repoPath,
    }),
  );
  const readFile = vi.fn(
    async (input: Parameters<ToolFileTransferVcs["readFile"]>[0]) => {
      if (options.failure) throw options.failure;
      if (input.file.kind !== "path") return null;
      if (options.missing && input.file.path === "src/a.ts") return null;
      const repoPath = input.repositoryId.slice("repository:".length);
      const destinationDefault = input.file.path.endsWith("moved.ts")
        ? "file:stable"
        : "file:copy";
      return {
        repositoryId: input.repositoryId,
        fileId:
          input.file.path === "src/a.ts"
            ? "file:stable"
            : (options.producedFileId ?? destinationDefault),
        repoPath,
        path: input.file.path,
        contentHash: "blob:1",
        authoredChangeId: "change:1",
        authoredByWorkUnitId: "work:1",
        contentClass: "internal" as const,
        externalKeys: [],
        mode: 0o644,
        content: { kind: "text" as const, text: "content" },
      };
    },
  );
  const mutationResult = (commandId: string) => ({
    contextId: "context:1",
    commandId,
    workUnitId: "work:1",
    applicationId: "application:next",
    changeCount: 1,
    changeIds: ["change:1"],
    incorporatedChangeCount: 0,
    incorporatedChangeIds: [],
    decisionIds: [],
    workingHead: next,
  });
  const move = vi.fn(
    async (input: Parameters<ToolFileTransferVcs["move"]>[0]) =>
      mutationResult(input.commandId),
  );
  const copy = vi.fn(
    async (input: Parameters<ToolFileTransferVcs["copy"]>[0]) =>
      mutationResult(input.commandId),
  );
  const vcs = {
    status,
    resolveRepository,
    readFile,
    move,
    copy,
  } satisfies ToolFileTransferVcs;
  return { vcs, move, copy, readFile };
}

describe("stable-identity file transfer tools", () => {
  it("moves one exact file identity", async () => {
    const { vcs, move } = fixture();
    const tool = createMoveFileTool("/", vcs, {
      contextId: "context:1",
      commandId: "command:move",
    });
    const result = await executeTool(
      tool,
      {
        source: "packages/source/src/a.ts",
        destination: "panels/target/src/moved.ts",
      },
      { callId: "call:1" },
    );

    expect(move).toHaveBeenCalledWith({
      contextId: "context:1",
      expectedWorkingHead: working,
      commandId: "command:move",
      moves: [
        {
          kind: "file",
          repositoryId: "repository:packages/source",
          fileId: "file:stable",
          destinationRepositoryId: "repository:panels/target",
          destinationPath: "src/moved.ts",
        },
      ],
    });
    expect(result.details).toMatchObject({
      operation: "moved",
      changeId: "change:1",
      destination: {
        workspacePath: "panels/target/src/moved.ts",
        root: {
          kind: "file",
          state: { kind: "application", applicationId: "application:next" },
          repositoryId: "repository:panels/target",
          fileId: "file:stable",
        },
      },
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        'provenance({ target: "panels/target/src/moved.ts" })',
      ),
    });
    expect(move.mock.calls[0]?.[0]).not.toHaveProperty("intentSummary");
  });

  it("copies from an exact source state", async () => {
    const { vcs, copy } = fixture();
    const tool = createCopyFileTool("/", vcs, {
      contextId: "context:1",
      commandId: "command:copy",
    });
    const result = await executeTool(
      tool,
      {
        source: "packages/source/src/a.ts",
        destination: "panels/target/src/copied.ts",
        intent:
          "Preserve the source adapter while creating the panel-specific variant",
      },
      { callId: "call:2" },
    );

    expect(copy).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedWorkingHead: working,
        intentSummary:
          "Preserve the source adapter while creating the panel-specific variant",
        copies: [
          {
            source: {
              state: working,
              repositoryId: "repository:packages/source",
              fileId: "file:stable",
            },
            destination: {
              repositoryId: "repository:panels/target",
              path: "src/copied.ts",
            },
          },
        ],
      }),
    );
    expect(toolResultDetails(result).operation).toBe("copied");
    expect(toolResultDetails(result).storage).toBe("vcs");
    expect(toolResultDetails(result).destination).toMatchObject({
      workspacePath: "panels/target/src/copied.ts",
      root: {
        kind: "file",
        repositoryId: "repository:panels/target",
        fileId: "file:copy",
      },
    });
  });

  it("uses the same direct storage contract for scratch copies and moves", async () => {
    const { vcs, copy, move } = fixture();
    const fs = {
      copyFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
    };
    const context = {
      contextId: "context:1",
      commandId: "command:scratch",
    };

    const copied = await executeTool(
      createCopyFileTool("/", vcs, context, fs),
      {
        source: ".tmp/source.txt",
        destination: ".tmp/copied.txt",
      },
      { callId: "call:scratch-copy" },
    );
    const moved = await executeTool(
      createMoveFileTool("/", vcs, context, fs),
      {
        source: ".tmp/copied.txt",
        destination: ".tmp/moved.txt",
      },
      { callId: "call:scratch-move" },
    );

    expect(fs.copyFile).toHaveBeenCalledWith(
      ".tmp/source.txt",
      ".tmp/copied.txt",
    );
    expect(fs.rename).toHaveBeenCalledWith(".tmp/copied.txt", ".tmp/moved.txt");
    expect(copied.details).toMatchObject({
      operation: "copied",
      storage: "scratch",
      source: { path: ".tmp/source.txt" },
      destination: { path: ".tmp/copied.txt" },
    });
    expect(moved.details).toMatchObject({
      operation: "moved",
      storage: "scratch",
    });
    expect(copy).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("returns a recoverable diagnostic instead of crossing storage boundaries", async () => {
    const { vcs, copy } = fixture();
    const fs = {
      copyFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
    };
    const tool = createCopyFileTool(
      "/",
      vcs,
      { contextId: "context:1", commandId: "command:cross-storage" },
      fs,
    );

    const result = await executeTool(
      tool,
      {
        source: ".tmp/source.txt",
        destination: "packages/target/source.txt",
      },
      { callId: "call:cross-storage" },
    );

    expect(result.details).toMatchObject({
      storage: "none",
      diagnostic: "cross-storage-transfer",
    });
    expect(fs.copyFile).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("reports a missing source without mutating", async () => {
    const { vcs, move } = fixture({ missing: true });
    const tool = createMoveFileTool("/", vcs, {
      contextId: "context:1",
      commandId: "command:missing",
    });
    await expect(
      executeTool(
        tool,
        {
          source: "packages/source/src/a.ts",
          destination: "panels/target/src/moved.ts",
        },
        { callId: "call:3" },
      ),
    ).rejects.toMatchObject({ code: "ENOENT", syscall: "move_file" });
    expect(move).not.toHaveBeenCalled();
  });

  it("fails closed when a transfer violates its identity contract", async () => {
    const { vcs } = fixture({ producedFileId: "file:changed" });
    const tool = createMoveFileTool("/", vcs, {
      contextId: "context:1",
      commandId: "command:identity-violation",
    });

    await expect(
      executeTool(
        tool,
        {
          source: "packages/source/src/a.ts",
          destination: "panels/target/src/moved.ts",
        },
        { callId: "call:identity-violation" },
      ),
    ).rejects.toMatchObject({
      code: "IntegrityFailure",
      errorData: {
        code: "IntegrityFailure",
        stage: "file-transfer-identity",
        operation: "move_file",
        sourceFileId: "file:stable",
        destinationFileId: "file:changed",
      },
    });
  });

  it("propagates graph/read failures", async () => {
    const failure = new Error("semantic authority unavailable");
    const { vcs, copy } = fixture({ failure });
    const tool = createCopyFileTool("/", vcs, {
      contextId: "context:1",
      commandId: "command:failure",
    });
    await expect(
      executeTool(
        tool,
        {
          source: "packages/source/src/a.ts",
          destination: "panels/target/src/copied.ts",
        },
        { callId: "call:4" },
      ),
    ).rejects.toBe(failure);
    expect(copy).not.toHaveBeenCalled();
  });
});
