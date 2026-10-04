import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@vibestudio/extension";

// Cwd admission is independent from terminal UI transports and the janitor.
vi.mock("./snugServer.js", () => ({
  SnugServer: class {
    async start() {}
  },
}));
vi.mock("./sessionManager.js", () => ({
  SessionManager: class {
    ptyAvailable = false;
    list() {
      return [];
    }
  },
}));
vi.mock("./nodeTimers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./nodeTimers.js")>()),
  nodeSetInterval: () => ({ unref() {} }),
}));

import { activate } from "./index.js";

describe("shell execution location", () => {
  it.each(["workspace", "caller-context", "explicit-context"])(
    "executes in the admitted %s folder even when private storage does not exist",
    async (location) => {
      const root = await mkdtemp(join(tmpdir(), "vibestudio-shell-cwd-"));
      const workspace = join(root, "workspace");
      await mkdir(workspace);
      const ensureContextFolder = vi.fn(async (contextId: string) => {
        const scratch = join(root, contextId);
        await mkdir(scratch);
        return { source: join(root, "source"), scratch };
      });
      const ctx = {
        storage: { root: join(root, "uncreated-private-storage") },
        workspace: {
          getInfo: async () => ({ path: workspace }),
          ensureContextFolder,
        },
        invocation: {
          current: () => ({
            caller: {
              callerId: "worker:probe",
              callerKind: "worker",
              ...(location !== "workspace" ? { contextId: "ctx-caller" } : {}),
            },
          }),
        },
        health: { degraded: vi.fn(), healthy: vi.fn() },
        log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
      } as unknown as ExtensionContext;
      try {
        const api = await activate(ctx);
        const result = await api.exec({
          intent: {
            kind: "argv",
            executable: process.execPath,
            args: ["-e", "process.stdout.write(process.cwd())"],
          },
          ...(location === "explicit-context"
            ? { contextId: "ctx-explicit" }
            : {}),
        });
        const expected =
          location === "workspace"
            ? workspace
            : join(
                root,
                location === "explicit-context" ? "ctx-explicit" : "ctx-caller",
              );
        expect(result).toMatchObject({ exitCode: 0, stdout: expected });
        expect(
          ensureContextFolder.mock.calls.map(([contextId]) => contextId),
        ).toEqual(
          location === "workspace"
            ? []
            : [location === "explicit-context" ? "ctx-explicit" : "ctx-caller"],
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
