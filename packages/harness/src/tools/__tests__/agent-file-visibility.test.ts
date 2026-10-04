import { executeTool } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import { createAgentFileVisibility } from "../agent-file-visibility.js";
import { createFindTool } from "../find.js";
import { createGrepTool } from "../grep.js";
import { createLsTool } from "../ls.js";
import { createReadTool } from "../read.js";
import { StubFs } from "./stub-fs.js";

const files = {
  "/skills/public/SKILL.md": "---\nname: public\n---\n# Public\n",
  "/skills/public/index.ts": 'export const visible = "needle";\n',
  "/skills/internal/SKILL.md":
    "---\nname: internal\nagentVisible: false\n---\n# Internal\n",
  "/skills/internal/fixture.ts": 'export const secret = "needle";\n',
};

/** The same skill, reached through an adopted project's nested workspace. */
const nestedFiles = {
  ...files,
  "/projects/base/skills/internal/SKILL.md":
    "---\nname: internal\nagentVisible: false\n---\n# Internal\n",
  "/projects/base/skills/internal/tests/fixture.ts":
    'export const secret = "needle";\n',
  "/projects/base/skills/public/SKILL.md": "---\nname: public\n---\n# Public\n",
  "/projects/base/skills/public/index.ts": 'export const visible = "needle";\n',
};

const unitFiles = {
  "/workers/private/package.json": JSON.stringify({
    name: "@workspace-workers/private",
    vibestudio: { kind: "worker", agentVisible: false },
  }),
  "/workers/private/index.ts": 'export const secret = "needle";\n',
  "/workers/open/package.json": JSON.stringify({
    name: "@workspace-workers/open",
    vibestudio: { kind: "worker" },
  }),
  "/workers/open/index.ts": 'export const visible = "needle";\n',
};

describe("agent file visibility", () => {
  it("uses agentVisible false as one catalog and filesystem boundary", async () => {
    const fs = new StubFs({ files });
    const visibility = createAgentFileVisibility("/", fs);

    await expect(
      visibility.isHidden("/skills/internal/fixture.ts"),
    ).resolves.toBe(true);
    await expect(visibility.isHidden("/skills/public/index.ts")).resolves.toBe(
      false,
    );

    const listed = await executeTool(
      createLsTool("/", fs, visibility),
      { path: "skills" },
      { callId: "ls" },
    );
    expect(listed.content[0]).toMatchObject({ text: "public/" });

    const read = await executeTool(
      createReadTool("/", fs, { visibility }),
      {
        path: "skills/internal/fixture.ts",
      },
      { callId: "read" },
    );
    expect(read).toMatchObject({ details: { missing: true } });

    const grep = await executeTool(
      createGrepTool("/", fs, { visibility }),
      {
        pattern: "needle",
        path: "skills",
        includeIgnored: true,
      },
      { callId: "grep" },
    );
    expect(grep.content[0]).toMatchObject({
      text: expect.stringContaining("public/index.ts"),
    });
    expect(grep.content[0]).not.toMatchObject({
      text: expect.stringContaining("internal"),
    });

    const found = await executeTool(
      createFindTool("/", fs, { visibility }),
      {
        pattern: "**/*.ts",
        path: "skills",
        includeIgnored: true,
      },
      { callId: "find" },
    );
    expect(found.content[0]).toMatchObject({ text: "public/index.ts" });
  });

  it("hides a declared skill at any depth, including inside an adopted project", async () => {
    const fs = new StubFs({ files: nestedFiles });
    const visibility = createAgentFileVisibility("/", fs);

    // The bypass this contract missed: a scan rooted at `skills/` hid the
    // top-level copy and left the adopted workspace's copy in plain view.
    await expect(
      visibility.isHidden("/projects/base/skills/internal/tests/fixture.ts"),
    ).resolves.toBe(true);
    await expect(
      visibility.isHidden("/projects/base/skills/public/index.ts"),
    ).resolves.toBe(false);

    const grep = await executeTool(
      createGrepTool("/", fs, { visibility }),
      {
        pattern: "needle",
        path: "projects",
        includeIgnored: true,
      },
      { callId: "grep" },
    );
    expect(grep.content[0]).toMatchObject({
      text: expect.stringContaining("public/index.ts"),
    });
    expect(grep.content[0]).not.toMatchObject({
      text: expect.stringContaining("internal"),
    });
  });

  it("hides a unit that declares itself invisible in its manifest", async () => {
    const fs = new StubFs({ files: unitFiles });
    const visibility = createAgentFileVisibility("/", fs);

    await expect(
      visibility.isHidden("/workers/private/index.ts"),
    ).resolves.toBe(true);
    await expect(visibility.isHidden("/workers/open/index.ts")).resolves.toBe(
      false,
    );

    const listed = await executeTool(
      createLsTool("/", fs, visibility),
      { path: "workers" },
      { callId: "ls" },
    );
    expect(listed.content[0]).toMatchObject({ text: "open/" });
  });

  it("treats a manifest without the flag, or unparseable JSON, as visible", async () => {
    const fs = new StubFs({
      files: {
        "/workers/broken/package.json": "{ not json",
        "/workers/broken/index.ts": "export const visible = 1;\n",
        "/workers/plain/package.json": JSON.stringify({ name: "plain" }),
        "/workers/plain/index.ts": "export const visible = 1;\n",
      },
    });
    const visibility = createAgentFileVisibility("/", fs);

    await expect(visibility.isHidden("/workers/broken/index.ts")).resolves.toBe(
      false,
    );
    await expect(visibility.isHidden("/workers/plain/index.ts")).resolves.toBe(
      false,
    );
  });

  it("terminates on a path that escapes the working root", async () => {
    const fs = new StubFs({ files });
    const visibility = createAgentFileVisibility("/workspace", fs);

    await expect(visibility.isHidden("/elsewhere/file.ts")).resolves.toBe(
      false,
    );
  });

  it("decodes visibility frontmatter without a Node Buffer global", async () => {
    const originalBuffer = globalThis.Buffer;
    vi.stubGlobal("Buffer", undefined);
    try {
      const fs = new StubFs({
        files: {
          "/skills/internal/SKILL.md": new TextEncoder().encode(
            "---\nname: internal\nagentVisible: false\n---\n# Internal\n",
          ),
        },
      });
      const visibility = createAgentFileVisibility("/", fs);

      await expect(
        visibility.isHidden("/skills/internal/SKILL.md"),
      ).resolves.toBe(true);
    } finally {
      vi.stubGlobal("Buffer", originalBuffer);
    }
  });

  it("filters hidden skill results returned by the host search service", async () => {
    const fs = new StubFs({ files });
    const visibility = createAgentFileVisibility("/", fs);
    const call = vi.fn(async (_target: string, method: string) => {
      if (method === "fs.grep") {
        return {
          matches: [
            {
              file: "internal/fixture.ts",
              lineNumber: 1,
              line: "needle",
              before: [],
              after: [],
            },
            {
              file: "public/index.ts",
              lineNumber: 1,
              line: "needle",
              before: [],
              after: [],
            },
          ],
          matchCount: 2,
          truncated: false,
        };
      }
      return {
        files: ["/skills/internal/fixture.ts", "/skills/public/index.ts"],
        truncated: false,
      };
    });

    const grep = await executeTool(
      createGrepTool("/", fs, { rpc: { call } as never, visibility }),
      { pattern: "needle", path: "skills", includeIgnored: true },
      { callId: "grep" },
    );
    expect(grep.content[0]).toMatchObject({
      text: "public/index.ts:1: needle",
    });

    const found = await executeTool(
      createFindTool("/", fs, {
        rpc: { call } as never,
        visibility,
      }),
      { pattern: "**/*.ts", path: "skills", includeIgnored: true },
      { callId: "find" },
    );
    expect(found.content[0]).toMatchObject({ text: "public/index.ts" });
  });
});
