import { afterEach, expect, it, vi } from "vitest";
import * as workspace from "./workspace.js";
import { createTemplateLifecycle } from "./lifecycle.js";
import type { ExtensionContextLike } from "./context.js";

const pin = {
  url: "https://example.test/base.git",
  ref: "refs/heads/main",
  commit: "a".repeat(40),
};
afterEach(() => vi.restoreAllMocks());
it("contributes only reviewed units owned by the selected source and rejects stale reviews", async () => {
  const observation: Awaited<ReturnType<typeof workspace.observeWorkspace>> = {
    mainEventId: "event:one",
    mainState: { kind: "event" as const, eventId: "event:one" },
    runtimeTop: { systemEpoch: 1 },
    authoredTop: { systemEpoch: 1 },
    manifest: {
      top: { systemEpoch: 1 },
      inventory: { repositories: [] },
      dependencies: [],
    },
    localRepoPaths: new Set(["meta", "panels/example", "panels/personal"]),
    templateDependencies: [],
    templateSources: [pin],
  };
  vi.spyOn(workspace, "observeWorkspace").mockResolvedValue(observation);
  const invoke = vi.fn().mockResolvedValue({ outcome: "nothing-to-suggest" });
  const lifecycle = createTemplateLifecycle(
    { extensions: { invoke } } as unknown as ExtensionContextLike,
    {
      inspect: async () => ({
        pin,
        repositories: ["meta", "panels/example"],
        dependencies: [],
      }),
      resolve: async () => pin,
    },
  );
  await expect(
    lifecycle.inspectContribution({
      sourceUrl: pin.url,
      parts: ["panels/personal"],
    }),
  ).rejects.toThrow("not an independently owned unit");
  await expect(
    lifecycle.inspectContribution({ sourceUrl: pin.url, parts: ["meta"] }),
  ).rejects.toThrow("Publish a complete template");
  const plan = await lifecycle.inspectContribution({
    sourceUrl: pin.url,
    parts: ["panels/example"],
  });
  expect(invoke).not.toHaveBeenCalled();
  await lifecycle.suggestContribution({ commandId: "contribute:one", plan });
  expect(invoke).toHaveBeenCalledWith(
    "@workspace-extensions/git-bridge",
    "suggestTemplateContribution",
    [
      expect.objectContaining({
        url: pin.url,
        baseCommit: pin.commit,
        expectedMainEventId: "event:one",
        parts: [{ repoPath: "panels/example", subdir: "panels/example" }],
      }),
    ],
  );
  observation.mainEventId = "event:two";
  await expect(
    lifecycle.suggestContribution({ commandId: "contribute:two", plan }),
  ).rejects.toThrow("review the contribution again");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("classifies the recorded authoring upstream, direct templates, and transitive sources", async () => {
  const upstream = { ...pin, url: "https://example.test/personal.git" };
  const dependency = { ...pin, url: "https://example.test/support.git" };
  const observation: Awaited<ReturnType<typeof workspace.observeWorkspace>> = {
    mainEventId: "event:one",
    mainState: { kind: "event" as const, eventId: "event:one" },
    runtimeTop: { systemEpoch: 1 },
    authoredTop: { systemEpoch: 1 },
    manifest: {
      top: { systemEpoch: 1 },
      inventory: { repositories: [] },
      dependencies: [],
      installation: { upstream, sources: [] },
    },
    localRepoPaths: new Set<string>(),
    templateDependencies: [{ url: pin.url }],
    templateSources: [dependency, pin, upstream],
  };
  vi.spyOn(workspace, "observeWorkspace").mockResolvedValue(observation);
  const lifecycle = createTemplateLifecycle({} as ExtensionContextLike, {
    inspect: async (pin) => ({ pin, repositories: [], dependencies: [] }),
    resolve: async () => pin,
  });
  expect(
    (await lifecycle.installed()).map((source) => [
      source.pin.url,
      source.relationship,
    ]),
  ).toEqual([
    [dependency.url, "transitive"],
    [pin.url, "direct"],
    [upstream.url, "upstream"],
  ]);
  observation.manifest.installation = {
    sources: [],
  };
  observation.templateDependencies = [{ url: upstream.url }];
  expect(
    (await lifecycle.installed()).map((source) => source.relationship),
  ).toEqual(["transitive", "transitive", "direct"]);
});
