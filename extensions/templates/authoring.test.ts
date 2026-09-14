import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";
import { inspectTemplateAuthoring } from "./authoring.js";

function observation(eventId: string) {
  return {
    mainEventId: eventId,
    mainState: { kind: "event" as const, eventId },
    runtimeTop: { systemEpoch: 0 },
    localRepoPaths: new Set(["meta", "panels/news"]),
    templateDependencies: [],
    templateFiles: [],
  };
}

function context() {
  return {
    rpc: {
      call: vi.fn(
        async (
          _target: string,
          method: string,
          input: { repoPath?: string; repositoryId?: string },
        ) => {
          if (method === "vcs.resolveRepository") {
            return {
              repositoryId: `repository:${input.repoPath}`,
              repoPath: input.repoPath,
            };
          }
          if (method === "vcs.readFile") {
            if (input.repositoryId === "repository:meta") {
              return {
                content: {
                  kind: "text",
                  text: "systemEpoch: 0\ntemplate:\n  name: Source\n  repositories: [panels/news]\n  files: []\n",
                },
              };
            }
            return {
              content: {
                kind: "text",
                text: JSON.stringify({
                  name:
                    input.repositoryId === "repository:packages/runtime"
                      ? "@workspace/runtime"
                      : "@workspace-panels/news",
                }),
              },
            };
          }
          throw new Error(`unexpected method ${method}`);
        },
      ),
    },
  };
}

describe("template authoring source closure", () => {
  it("binds the protected meta repository while keeping it out of runtime repositories", async () => {
    const ctx = context();
    const request = {
      name: "News",
      description: "News workspace",
      parts: ["panels/news"],
    };
    const first = await inspectTemplateAuthoring(
      ctx as never,
      observation("event:one") as never,
      request,
      { repositories: [], files: [] },
    );
    const second = await inspectTemplateAuthoring(
      ctx as never,
      observation("event:two") as never,
      request,
      { repositories: [], files: [] },
    );

    expect(first.includedParts).toEqual(["meta", "panels/news"]);
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(YAML.parse(first.manifest).template).toEqual(
      expect.objectContaining({
        repositories: ["panels/news"],
        files: [],
      }),
    );
  });

  it("publishes the workspace's recorded dependency without copying its repositories", async () => {
    const ctx = context();
    const current = {
      ...observation("event:one"),
      localRepoPaths: new Set(["meta", "packages/runtime", "panels/news"]),
      templateDependencies: [{ url: "https://example.test/base.git" }],
    };
    const result = await inspectTemplateAuthoring(
      ctx as never,
      current as never,
      { name: "News", description: "News workspace", parts: ["panels/news"] },
      { repositories: ["packages/runtime"], files: [] },
    );

    expect(result.includedParts).toEqual(["meta", "panels/news"]);
    expect(YAML.parse(result.manifest).template.dependencies).toEqual([
      { url: "https://example.test/base.git" },
    ]);
  });

  it("does not republish standalone files supplied by dependencies", async () => {
    const current = {
      ...observation("event:one"),
      templateDependencies: [{ url: "https://example.test/base.git" }],
      templateFiles: ["AGENTS.md", "PERSONAL.md"],
    };
    const result = await inspectTemplateAuthoring(
      context() as never,
      current as never,
      { name: "News", description: "News workspace", parts: ["panels/news"] },
      { repositories: [], files: ["AGENTS.md"] },
    );

    expect(YAML.parse(result.manifest).template.files).toEqual(["PERSONAL.md"]);
  });
});
