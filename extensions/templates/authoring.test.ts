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
                  text: "systemEpoch: 0\ntemplate:\n  name: Source\n  repositories: [panels/news]\n",
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
  it("binds the protected meta repository while declaring ownership of its companion files", async () => {
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
      { repositories: [] },
    );
    const second = await inspectTemplateAuthoring(
      ctx as never,
      observation("event:two") as never,
      request,
      { repositories: [] },
    );

    expect(first.includedParts).toEqual(["meta", "panels/news"]);
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(YAML.parse(first.manifest).template).toEqual(
      expect.objectContaining({
        repositories: ["meta", "panels/news"],
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
      { repositories: ["packages/runtime"] },
    );

    expect(result.includedParts).toEqual(["meta", "panels/news"]);
    expect(YAML.parse(result.manifest).template.dependencies).toEqual([
      { url: "https://example.test/base.git" },
    ]);
  });
});

it("retains package providers by their owning repository and extension providers by path", async () => {
  const current = {
    ...observation("event:providers"),
    localRepoPaths: new Set([
      "meta",
      "packages/runtime",
      "extensions/git-bridge",
    ]),
    runtimeTop: {
      systemEpoch: 0,
      providers: {
        evalRuntime: { source: "@workspace/runtime" },
        gitInterop: { extension: "extensions/git-bridge" },
      },
    },
  };
  const inspect = (parts: string[]) =>
    inspectTemplateAuthoring(
      context() as never,
      current as never,
      { name: "Selected", description: "Selected source", parts },
      { repositories: [] },
    );
  expect(
    YAML.parse(
      (await inspect(["packages/runtime", "extensions/git-bridge"])).manifest,
    ).providers,
  ).toEqual(current.runtimeTop.providers);
  expect(
    YAML.parse((await inspect(["extensions/git-bridge"])).manifest).providers,
  ).toEqual({ gitInterop: current.runtimeTop.providers.gitInterop });
});
