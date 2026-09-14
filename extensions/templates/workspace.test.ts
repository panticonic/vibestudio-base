import { describe, expect, it, vi } from "vitest";
import { observeWorkspace } from "./workspace.js";
import type { ExtensionContextLike } from "./context.js";

describe("template workspace observation", () => {
  it("reads one exact protected main and inventories it without creating a context", async () => {
    const state = { kind: "event", eventId: "event:current-main" };
    const call = vi.fn(
      async (_target: string, method: string, ...args: unknown[]) => {
        if (method === "vcs.mainState") {
          expect(args).toEqual([]);
          return state;
        }
        if (method === "vcs.listDirectory") {
          expect(args[0]).toMatchObject({ state });
          return {
            state,
            path: "",
            entries: [
              { path: "meta", kind: "directory", repositoryRoot: true },
            ],
            nextCursor: null,
          };
        }
        // Observation also reads the workspace's own manifest, which is what
        // exposes the templates it is composed from.
        if (method === "vcs.resolveRepository") {
          expect(args[0]).toMatchObject({ state, repoPath: "meta" });
          return { repositoryId: "repository:meta" };
        }
        if (method === "vcs.readFile") {
          expect(args[0]).toMatchObject({
            state,
            repositoryId: "repository:meta",
          });
          return {
            content: {
              kind: "text",
              text: [
                "systemEpoch: 1",
                "template:",
                "  name: Test",
                "  description: Test template",
                "  repositories: []",
                "  files: []",
                "  dependencies:",
                "    - url: git+https://example.test/base.git",
                "",
              ].join("\n"),
            },
          };
        }
        throw new Error(`Unexpected observation mutation: ${method}`);
      },
    );
    const ctx = {
      rpc: { call },
      workspace: {
        getInfo: async () => ({
          id: "workspace:test",
          config: { systemEpoch: 1 },
        }),
      },
    } as unknown as ExtensionContextLike;
    await expect(observeWorkspace(ctx)).resolves.toMatchObject({
      mainState: state,
      mainEventId: state.eventId,
      localRepoPaths: new Set(["meta"]),
      templateDependencies: [{ url: "git+https://example.test/base.git" }],
    });
    expect(call.mock.calls.map(([, method]) => method)).toEqual([
      "vcs.mainState",
      "vcs.resolveRepository",
      "vcs.readFile",
      "vcs.listDirectory",
    ]);
  });
});
