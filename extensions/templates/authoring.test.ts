import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";
import { inspectTemplateAuthoring } from "./authoring.js";

function observation(eventId: string) {
  return {
    mainEventId: eventId,
    mainState: { kind: "event" as const, eventId },
    runtimeTop: { systemEpoch: 0 },
    installation: null,
    localRepoPaths: new Set(["meta", "panels/news"]),
    templateDependencies: [],
    manifest: { dependencies: [], top: { systemEpoch: 0 } },
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
                  text: "systemEpoch: 0\ntemplate:\n  name: Source\n",
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
    expect(YAML.parse(first.manifest).template).not.toHaveProperty(
      "repositories",
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
  current.manifest.top = current.runtimeTop;
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

it("publishes a selected inherited unit as an explicit override and permits dependency-only releases", async () => {
  const current = {
    ...observation("event:override"),
    templateDependencies: [{ url: "https://example.test/base.git" }],
  };
  const inherited = {
    repositories: ["panels/news"],
    owners: new Map([["panels/news", "https://example.test/base.git"]]),
  };
  const inspect = (parts: string[]) =>
    inspectTemplateAuthoring(
      context() as never,
      current as never,
      { name: "Mine", description: "My workspace", parts },
      inherited,
    );
  const overridePlan = await inspect(["panels/news"]);
  const override = YAML.parse(overridePlan.manifest);
  expect(overridePlan.includedParts).toEqual(["meta", "panels/news"]);
  expect(override.template).toEqual({
    name: "Mine",
    description: "My workspace",
    dependencies: current.templateDependencies,
    overrides: [
      { repoPath: "panels/news", source: "https://example.test/base.git" },
    ],
  });
  const onlyDependencyPlan = await inspect([]);
  const onlyDependency = YAML.parse(onlyDependencyPlan.manifest);
  expect(onlyDependencyPlan.includedParts).toEqual(["meta"]);
  expect(onlyDependency.template).not.toHaveProperty("repositories");
  expect(onlyDependency.template.dependencies).toEqual(
    current.templateDependencies,
  );
  expect(onlyDependency.template.overrides).toBeUndefined();
});

it("retains declared workspace defaults when incidental repositories are excluded", async () => {
  const current = observation("event:defaults");
  // Use a real parsed configuration value so the test checks the released manifest.
  const config = {
    systemEpoch: 0,
    defaultAgentConfig: { model: "provider:model" },
    panelRestorePolicy: "focused" as const,
  };
  const source = {
    ...current,
    manifest: { ...current.manifest, top: config },
    runtimeTop: config,
    localRepoPaths: new Set(["meta", "panels/news", "projects/scratch"]),
  };
  const ctx = context();
  const baseCall = ctx.rpc.call.getMockImplementation()!;
  ctx.rpc.call.mockImplementation(async (target, method, input) => {
    if (
      method === "vcs.readFile" &&
      input.repositoryId === "repository:projects/scratch"
    )
      return null as never;
    return baseCall(target, method, input);
  });
  const plan = await inspectTemplateAuthoring(
    ctx as never,
    source as never,
    { name: "News", description: "News workspace", parts: ["panels/news"] },
    { repositories: [] },
  );
  expect(YAML.parse(plan.manifest).defaultAgentConfig).toEqual(
    config.defaultAgentConfig,
  );
  expect(YAML.parse(plan.manifest).panelRestorePolicy).toBe("focused");
  expect(plan.includedParts).not.toContain("projects/scratch");
});

it("preserves authored startup configuration referencing a dependency without copying its unit", async () => {
  const current = observation("event:onboarding");
  const startup = [
    { source: "panels/news", stateArgs: { initialPrompt: "Welcome me" } },
  ];
  const source = {
    ...current,
    manifest: { top: { systemEpoch: 0, initPanels: startup }, dependencies: [{ url: "https://example.test/base.git" }] },
    runtimeTop: { systemEpoch: 0, initPanels: startup },
    templateDependencies: [{ url: "https://example.test/base.git" }],
  };
  const result = await inspectTemplateAuthoring(
    context() as never,
    source as never,
    { name: "Personal", description: "Personal workspace", parts: [] },
    { repositories: ["panels/news"] },
  );
  const manifest = YAML.parse(result.manifest);
  expect(manifest.initPanels).toEqual(startup);
  expect(result.includedParts).toEqual(["meta"]);
  expect(manifest.template).not.toHaveProperty("repositories");
  expect(manifest.template.dependencies).toEqual(source.templateDependencies);
});
