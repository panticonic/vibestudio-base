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
    installation: null,
    mainEventId: "event:one",
    mainState: { kind: "event" as const, eventId: "event:one" },
    runtimeTop: { systemEpoch: 1 },
    manifest: {
      top: { systemEpoch: 1 },
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
    manifest: {
      top: { systemEpoch: 1 },
      dependencies: [],
    },
    installation: { upstream, sources: [] },
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
  observation.installation = {
    sources: [],
  };
  observation.templateDependencies = [{ url: upstream.url }];
  expect(
    (await lifecycle.installed()).map((source) => source.relationship),
  ).toEqual(["transitive", "transitive", "direct"]);
});

it("refreshes a selected parent's dependency closure while retaining peer selections", async () => {
  const { selectTemplateUpdateSources } = await import("./lifecycle");
  const { parseTemplateManifestContent } =
    await import("@vibestudio/workspace/templateManifest");
  const base = pin;
  const parent = { ...pin, url: "https://example.test/personal.git" };
  const peer = { ...pin, url: "https://example.test/news.git" };
  const root = { ...pin, url: "https://example.test/root.git" };
  const sourceManifest = (
    dependencies: Array<{ url: string; commit?: string }> = [],
  ) =>
    JSON.stringify({
      systemEpoch: 0,
      template: {  dependencies },
    });
  const installation = {
          sources: [
            { pin: base, manifest: sourceManifest() },
            {
              pin: parent,
              manifest: sourceManifest([
                { url: base.url, commit: base.commit },
              ]),
            },
            { pin: peer, manifest: sourceManifest() },
            {
              pin: root,
              manifest: sourceManifest([
                { url: parent.url },
                { url: peer.url },
              ]),
            },
          ],
        };
  const manifest = parseTemplateManifestContent(
    JSON.stringify({
      systemEpoch: 0,
      template: {
        dependencies: [{ url: root.url }],

      },
    }),
    0,
  );
  const target = { ...parent, commit: "b".repeat(40) };
  expect(
    selectTemplateUpdateSources(manifest, [base, parent, peer, root], target, installation),
  ).toEqual([target, peer, root]);
  // The incoming parent's declaration, rather than an installed dependency pin,
  // remains responsible for choosing its dependency's exact version.
  expect(installation.sources[1]?.manifest).toContain(base.commit);
});

it.each([0, 1])(
  "publishes the actual candidate generation %s through the native approval flow",
  async (offset) => {
    const { TemplateOperations } = await import("./operations");
    const { WORKSPACE_SYSTEM_EPOCH } =
      await import("@vibestudio/shared/vcs/systemEpoch");
    const candidateEpoch = WORKSPACE_SYSTEM_EPOCH + offset;
    const state = { kind: "event", eventId: "candidate:one" };
    const operation = {
      request: { commandId: "update:one", sourceUrl: pin.url },
      contextId: "update:context",
      mainEventId: "main:one",
      target: pin,
      before: { repositories: [] },
      after: { repositories: [], installation: { sources: [{ pin, manifest: "systemEpoch: 0\n" }] } },
      steps: { commit: { method: "vcs.commit", args: [], done: true } },
      published: false,
    };
    vi.spyOn(TemplateOperations.prototype, "load").mockResolvedValue(operation);
    vi.spyOn(TemplateOperations.prototype, "save").mockResolvedValue();
    const call = vi.fn(
      async (_target: string, method: string, ..._args: unknown[]) => {
        if (method === "vcs.status")
          return {
            contextId: "update:context",
            committed: state,
            workingHead: state,
            clean: true,
            mainEventId: "main:one",
            mainRelation: "ahead",
            workingCounts: { applications: 0, workUnits: 0, changes: 0 },
            integrating: [],
          };
        if (method === "vcs.resolveRepository")
          return { state, repositoryId: "meta:one", repoPath: "meta" };
        if (method === "vcs.readFile")
          return {
            repositoryId: "meta:one",
            fileId: "manifest:one",
            repoPath: "meta",
            path: "vibestudio.yml",
            contentHash: "blob:one",
            authoredChangeId: "change:one",
            authoredByWorkUnitId: "unit:one",
            contentClass: "internal",
            externalKeys: [],
            mode: 0o644,
            content: { kind: "text", text: `systemEpoch: ${candidateEpoch}\n` },
          };
        if (method === "vcs.push") return {};
        throw new Error(`Unexpected call ${method}`);
      },
    );
    const lifecycle = createTemplateLifecycle(
      { rpc: { call } } as unknown as ExtensionContextLike,
      {
        inspect: async () => ({ pin, repositories: [], dependencies: [] }),
        resolve: async () => pin,
      },
    );
    expect(
      (await lifecycle.publishUpdate({ operationId: "update:one" })).status,
    ).toBe("published");
    expect(call).toHaveBeenCalledWith(
      "main",
      "vcs.readFile",
      expect.objectContaining({ state }),
    );
    const publish = call.mock.calls.find(
      (args) => args[1] === "vcs.push",
    ) as unknown as [string, string, Record<string, unknown>];
    expect(publish[2]).toEqual({
      commandId: "update:context:push",
      contextId: "update:context",
      expectedCommittedEventId: "candidate:one",
      expectedMainEventId: "main:one",
      templateInstallation: operation.after.installation,
      ...(offset ? { epochTransition: true } : {}),
    });
  },
);
