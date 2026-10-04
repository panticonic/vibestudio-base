import { executeTool, toolResultDetails } from "../../testing/native-tool.js";
import { describe, expect, it } from "vitest";
import { createEditTool } from "../edit.js";
import { createMemoryWorkspaceFileObservationStore } from "../file-observations.js";
import { StubFs } from "./stub-fs.js";
import { StubVcs } from "./stub-vcs.js";

const CWD = "/";
const authority = { contextId: "context:test", commandId: "command:edit" };

describe("canonical edit tool", () => {
  it("resolves exact file identity and records a guarded semantic change", async () => {
    const vcs = new StubVcs({ files: { "meta/a.ts": "const x = 1;\n" } });
    const tool = createEditTool(CWD, vcs, authority);
    const result = await executeTool(
      tool,
      {
        path: "meta/a.ts",
        oldText: "1",
        newText: "42",
        intent: "Align the fixture with the revised protocol version",
      },
      { callId: "invocation:1" },
    );

    expect(vcs.read("meta/a.ts")).toBe("const x = 42;\n");
    expect(vcs.lastEditInput).toMatchObject({
      contextId: "context:test",
      expectedWorkingHead: { kind: "event", eventId: "event:committed" },
      commandId: "command:edit",
      intentSummary: "Align the fixture with the revised protocol version",
      changes: [
        {
          kind: "text-edit",
          repositoryId: "repository:meta",
          fileId: "file:meta/a.ts",
          edits: [{ start: 10, end: 11, text: "42" }],
        },
      ],
    });
    expect(toolResultDetails(result).storage).toBe("vcs");
    expect(tool.description).toContain('vcs({ operation: "revert"');
  });

  it("reports ambiguous text without mutating", async () => {
    const vcs = new StubVcs({ files: { "meta/a.ts": "foo\nfoo\n" } });
    const tool = createEditTool(CWD, vcs, authority);
    const result = await executeTool(
      tool,
      {
        path: "meta/a.ts",
        oldText: "foo",
        newText: "bar",
      },
      { callId: "invocation:2" },
    );
    expect(result.details).toMatchObject({
      status: "conflict",
      conflicts: [
        {
          reason: "ambiguous",
          matchMode: "exact",
          matchCount: 2,
          candidateLines: [1, 2],
        },
      ],
    });
    expect(vcs.lastEditInput).toBeUndefined();
  });

  it("uses unchanged replacement context only for matching, not authorship", async () => {
    const vcs = new StubVcs({
      files: {
        "meta/a.ts":
          'export const value = "baseline";\nexport const neighbor = "untouched";\n',
      },
    });
    const tool = createEditTool(CWD, vcs, authority);
    await executeTool(
      tool,
      {
        path: "meta/a.ts",
        oldText:
          'export const value = "baseline";\nexport const neighbor = "untouched";',
        newText:
          'export const value = "edited";\nexport const neighbor = "untouched";',
      },
      { callId: "invocation:context" },
    );

    expect(vcs.read("meta/a.ts")).toBe(
      'export const value = "edited";\nexport const neighbor = "untouched";\n',
    );
    expect(vcs.lastEditInput?.changes[0]).toMatchObject({
      kind: "text-edit",
      edits: [{ start: 22, end: 30, text: "edited" }],
    });
  });

  it("uses fuzzy comparison only to locate the original span", async () => {
    const original = "keep — dash  \nsay “hello” world\r\ntail\n";
    const vcs = new StubVcs({ files: { "meta/a.ts": original } });
    const tool = createEditTool(CWD, vcs, authority);
    await executeTool(
      tool,
      {
        path: "meta/a.ts",
        oldText: '"hello"',
        newText: "goodbye",
      },
      { callId: "invocation:fuzzy" },
    );

    expect(vcs.read("meta/a.ts")).toBe(
      "keep — dash  \nsay goodbye world\r\ntail\n",
    );
    expect(vcs.lastEditInput?.changes[0]).toMatchObject({
      kind: "text-edit",
      edits: [{ start: 18, end: 25, text: "goodbye" }],
    });
    const result = await executeTool(
      createEditTool(
        CWD,
        new StubVcs({ files: { "meta/a.ts": "say “hello”\n" } }),
        authority,
      ),
      {
        path: "meta/a.ts",
        oldText: 'say "hello"',
        newText: "say goodbye",
      },
      { callId: "invocation:fuzzy-evidence" },
    );
    expect(toolResultDetails(result).operations[0]?.matches).toEqual([
      { replacement: 0, mode: "normalized", line: 1 },
    ]);
  });

  it("keeps non-repository scratch edits on the scoped filesystem", async () => {
    const vcs = new StubVcs();
    const fs = new StubFs({ files: { ".tmp/note.txt": "before" } });
    const tool = createEditTool(CWD, vcs, authority, fs);
    const result = await executeTool(
      tool,
      {
        path: ".tmp/note.txt",
        oldText: "before",
        newText: "after",
      },
      { callId: "invocation:3" },
    );
    await expect(fs.readFile(".tmp/note.txt", "utf8")).resolves.toBe("after");
    expect(toolResultDetails(result).storage).toBe("scratch");
  });

  it("rejects a stale trusted observation without exposing hashes", async () => {
    const vcs = new StubVcs({
      files: { "meta/a.ts": "export const currentValue = 2;\n" },
    });
    const observations = createMemoryWorkspaceFileObservationStore();
    observations.record("meta/a.ts", "f".repeat(64));
    const tool = createEditTool(CWD, vcs, authority, undefined, observations);

    const result = await executeTool(
      tool,
      {
        path: "meta/a.ts",
        oldText: "currentValue = 1",
        newText: "currentValue = 3",
      },
      { callId: "invocation:stale-observation" },
    );

    expect(result.details).toMatchObject({
      status: "conflict",
      conflicts: [
        {
          reason: "content-changed",
          closestCurrentExcerpts: [
            expect.objectContaining({
              text: expect.stringContaining("currentValue = 2"),
            }),
          ],
          recovery: { action: "reobserve" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("contentHash");
    expect(JSON.stringify(result)).not.toContain("receipt");
    expect(vcs.lastEditInput).toBeUndefined();
  });
});
