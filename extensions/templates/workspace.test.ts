import { describe, expect, it, vi } from "vitest";
import { observeWorkspace } from "./workspace.js";
import type { ExtensionContextLike } from "./context.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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
          const { path } = args[0] as { path: string };
          return {
            state,
            path,
            entries:
              path === ""
                ? [
                    { path: "meta", kind: "directory", repositoryRoot: true },
                    {
                      path: "extensions",
                      kind: "directory",
                      repositoryRoot: false,
                    },
                    {
                      path: "workers",
                      kind: "directory",
                      repositoryRoot: false,
                    },
                  ]
                : path === "extensions"
                  ? [
                      {
                        path: "extensions/templates",
                        kind: "directory",
                        repositoryRoot: true,
                      },
                    ]
                  : [
                      {
                        path: "workers/models",
                        kind: "directory",
                        repositoryRoot: true,
                      },
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
                "systemEpoch: 0",
                "template:",
                "  name: Test",
                "  description: Test template",
                "  dependencies:",
                "    - url: git+https://example.test/base.git",
                "services:",
                "  - name: models",
                "    source: workers/models",
                "",
              ].join("\n"),
            },
          };
        }
        if (method === "workspaceTemplateSource.readInstallation") {
          expect(args).toEqual([{ eventId: state.eventId }]);
          return null;
        }
        throw new Error(`Unexpected observation mutation: ${method}`);
      },
    );
    const ctx = {
      log: { info: vi.fn(), warn: vi.fn() },
      rpc: { call },
    } as unknown as ExtensionContextLike;
    await expect(observeWorkspace(ctx)).resolves.toMatchObject({
      mainState: state,
      mainEventId: state.eventId,
      runtimeTop: { services: [{ name: "models", source: "workers/models" }] },
      localRepoPaths: new Set([
        "meta",
        "extensions/templates",
        "workers/models",
      ]),
      templateDependencies: [{ url: "git+https://example.test/base.git" }],
    });
    expect(
      call.mock.calls
        .filter(([, method]) => method === "vcs.listDirectory")
        .map(([, , input]) => (input as { path: string }).path)
        .sort(),
    ).toEqual(["", "extensions", "workers"]);
    expect(
      call.mock.calls.filter(([, method]) => method === "vcs.readFile"),
    ).toHaveLength(1);
  });

  it("starts sibling repository listings together and joins them on the same main state", async () => {
    const state = { kind: "event", eventId: "event:current-main" };
    const extensionsResult = deferred<unknown>();
    const workersResult = deferred<unknown>();
    const bothStarted = deferred<void>();
    const firstTurnChecked = deferred<"both" | "one">();
    const started = new Set<string>();
    const call = vi.fn(
      async (_target: string, method: string, ...args: unknown[]) => {
        if (method === "vcs.mainState") return state;
        if (method === "vcs.resolveRepository")
          return { repositoryId: "repository:meta" };
        if (method === "vcs.readFile") {
          return {
            content: {
              kind: "text",
              text: "systemEpoch: 0\ntemplate:\n  name: Test\n  description: Test template\n",
            },
          };
        }
        if (method === "workspaceTemplateSource.readInstallation") return null;
        if (method === "vcs.listDirectory") {
          const input = args[0] as { state: typeof state; path: string };
          expect(input.state).toEqual(state);
          if (input.path === "") {
            return {
              state,
              path: "",
              entries: [
                { path: "meta", kind: "directory", repositoryRoot: true },
                {
                  path: "extensions",
                  kind: "directory",
                  repositoryRoot: false,
                },
                { path: "workers", kind: "directory", repositoryRoot: false },
              ],
              nextCursor: null,
            };
          }
          started.add(input.path);
          if (started.size === 1) {
            queueMicrotask(() =>
              firstTurnChecked.resolve(started.size === 2 ? "both" : "one"),
            );
          }
          if (started.size === 2) bothStarted.resolve();
          return input.path === "extensions"
            ? extensionsResult.promise
            : workersResult.promise;
        }
        throw new Error(`Unexpected observation call: ${method}`);
      },
    );
    const ctx = {
      log: { info: vi.fn(), warn: vi.fn() },
      rpc: { call },
    } as unknown as ExtensionContextLike;
    const observation = observeWorkspace(ctx);

    try {
      expect(
        await Promise.race([
          bothStarted.promise.then(() => "both" as const),
          firstTurnChecked.promise,
        ]),
      ).toBe("both");
      expect([...started].sort()).toEqual(["extensions", "workers"]);
      extensionsResult.resolve({
        state,
        path: "extensions",
        entries: [
          {
            path: "extensions/templates",
            kind: "directory",
            repositoryRoot: true,
          },
        ],
        nextCursor: null,
      });
      workersResult.resolve({
        state,
        path: "workers",
        entries: [
          { path: "workers/models", kind: "directory", repositoryRoot: true },
        ],
        nextCursor: null,
      });
      await expect(observation).resolves.toMatchObject({
        mainState: state,
        localRepoPaths: new Set([
          "meta",
          "extensions/templates",
          "workers/models",
        ]),
      });
    } finally {
      extensionsResult.resolve({
        state,
        path: "extensions",
        entries: [],
        nextCursor: null,
      });
      workersResult.resolve({
        state,
        path: "workers",
        entries: [],
        nextCursor: null,
      });
      await observation.catch(() => undefined);
    }
  });
});
