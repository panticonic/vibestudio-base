import { expect, it, vi } from "vitest";
import { createWorkspaceIntegration } from "./workspaceIntegration.js";

type Options = Parameters<typeof createWorkspaceIntegration>[0];
type Status = "adopt" | "convergent" | "composed" | "conflict" | "resolved";
const start = { kind: "event", eventId: "current" };
const source = { kind: "event" as const, eventId: "incoming" };
const file = (id: string) => ({ kind: "file" as const, id });

function bound(records: [string, Status][]) {
  const merge = vi.fn(async () => ({ workingHead: { kind: "event", eventId: "integrated" } }));
  const options: Options = {
    contextId: "owned",
    source,
    files: ["a", "b"].map(path => ({ path, repositoryId: "repo", workspacePath: "owned/" + path })),
    vcs: {
      async status() { return { workingHead: start }; },
      async compare() { return { coordinates: records.map(([id, status]) => ({
        coordinate: { ...file(id), paths: ["owned/" + id] }, status, resolutions: ["current"],
      })), intents: [], nextCursor: null }; },
      async readFile({ file }: { file: { path: string } }) {
        return { repositoryId: "repo", fileId: file.path, content: { kind: "text", text: file.path } };
      },
      merge,
    } as unknown as Options["vcs"],
  };
  return { service: createWorkspaceIntegration(options), merge };
}

it("merges exact selected files without silently adopting neighboring coordinates", async () => {
  const { service, merge } = bound([["a", "conflict"], ["b", "convergent"], ["outside", "adopt"]]);
  const observed = await service.observe();
  const decision = { coordinate: file("a"), resolution: "current" as const, rationale: "Retain both owned intentions." };
  expect((await service.merge(observed.head, [decision])).head).toContain("integrated");
  expect(merge).toHaveBeenCalledWith(expect.objectContaining({
    coordinates: [file("a"), file("b")], resolutions: [decision],
  }));
});

it("records assigned convergence without auto-applying pending differences", async () => {
  const { service, merge } = bound([["a", "convergent"], ["b", "adopt"], ["outside", "convergent"]]);
  const observed = await service.observe();
  await service.merge(observed.head, []);
  expect(merge).toHaveBeenCalledWith(expect.objectContaining({
    coordinates: [file("a")], resolutions: [],
  }));
});

it("refuses an empty merge with only unresolved or outside changes to consider", async () => {
  const { service, merge } = bound([["a", "conflict"], ["b", "adopt"], ["outside", "convergent"]]);
  const observed = await service.observe();
  await expect(service.merge(observed.head, [])).rejects.toThrow("No assigned coordinate");
  expect(merge).not.toHaveBeenCalled();
});
