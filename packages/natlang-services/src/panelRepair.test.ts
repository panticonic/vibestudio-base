import { describe, it, expect, vi } from "vitest";
import { createPanelRepair } from "./panelRepair.js";

function world() {
  let head = { kind: "event", eventId: "e1" };
  let text = "broken";
  const state = {
    panelId: "p1",
    contextId: "ctx1",
    source: "panels/demo",
    kind: "workspace",
    requestedRef: "ctx:ctx1",
    phase: "ready",
    attemptId: "a1",
    runtimeEntityId: "r1",
    buildKey: "b1",
  };
  const click = vi.fn(async () => undefined);
  const ports = {
    contextId: "ctx1",
    panelSource: "panels/demo",
    panel: {
      observe: vi.fn(async () => ({ ...state })),
      snapshot: vi.fn(async () => ({
        ...state,
        document: { text: 'button "Save"', structure: {} },
      })),
      cdp: {
        consoleHistory: vi.fn(async () => ({ entries: [] })),
        session: vi.fn(async () => ({
          page: {
            getByRole: () => ({
              click,
              fill: click,
              count: async () => 1,
              textContent: async () => "Save",
              inputValue: async () => "draft",
            }),
          },
        })),
      },
      rebuild: vi.fn(async () => {
        state.attemptId = "a2";
        state.buildKey = "b2";
        return { ...state };
      }),
    },
    vcs: {
      status: vi.fn(async () => ({ workingHead: { ...head } })),
      resolveRepository: vi.fn(async () => ({ repositoryId: "repo1" })),
      readFile: vi.fn(async () => ({
        repositoryId: "repo1",
        fileId: "f1",
        content: { kind: "text", text },
      })),
      listFiles: vi.fn(async () => ({
        files: [{ path: "App.tsx" }],
        nextCursor: null,
      })),
      edit: vi.fn(async () => {
        head = { kind: "event", eventId: "e2" };
        text = "fixed";
        return { workingHead: { ...head } };
      }),
    },
    build: {
      getBuildReport: vi.fn(async () => ({
        status: "ok",
        stateHash: "hash2",
        repoPath: "panels/demo",
        kind: "panel",
        diagnostics: [],
        builds: [{ target: "runtime", buildKey: "b2", diagnosticIndexes: [] }],
      })),
    },
  };
  const service = createPanelRepair(ports as unknown as Parameters<typeof createPanelRepair>[0]);
  return { service, ports, state, click };
}

describe("panelRepair authority binding", () => {
  it("applies one exact revision-protected command and rebuilds only its successful build", async () => {
    const { service, ports } = world();
    const initial = await service.observe();
    await expect(service.rebuild(initial.revision)).rejects.toThrow("Build this exact revision");
    const applied = await service.apply(initial.revision, [
      { path: "panels/demo/App.tsx", before: "broken", after: "fixed" },
    ]);
    expect(ports.vcs.edit).toHaveBeenCalledTimes(1);
    expect(ports.vcs.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: "ctx1",
        expectedWorkingHead: { kind: "event", eventId: "e1" },
        changes: [expect.objectContaining({ repositoryId: "repo1", fileId: "f1" })],
      }),
    );
    expect((await service.build(applied.revision)).passed).toBe(true);
    expect((await service.rebuild(applied.revision)).generation).not.toEqual(initial.generation);
    expect(ports.build.getBuildReport).toHaveBeenCalledWith("panels/demo", "ctx:ctx1");
  });
  it("refuses stale revisions, before-text mismatches and paths outside the panel before mutation", async () => {
    const { service, ports } = world();
    const initial = await service.observe();
    for (const [revision, path, before] of [
      ["old", "panels/demo/App.tsx", "broken"],
      [initial.revision, "panels/other/App.tsx", "broken"],
      [initial.revision, "panels/demo/App.tsx", "different"],
    ])
      await expect(service.apply(revision!, [{ path: path!, before: before!, after: "fixed" }])).rejects.toThrow();
    expect(ports.vcs.edit).not.toHaveBeenCalled();
  });
  it("rejects foreign panels and stale rendered attempts before browser actions", async () => {
    const { service, state, click } = world();
    const initial = await service.observe();
    state.attemptId = "new";
    await expect(
      service.interact(initial.generation, {
        steps: [{ kind: "click", role: "button", name: "Save" }],
      }),
    ).rejects.toThrow("generation changed");
    expect(click).not.toHaveBeenCalled();
    state.contextId = "other";
    await expect(service.observe()).rejects.toThrow("selected workspace");
  });
});
