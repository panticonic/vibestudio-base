import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeTestExecutionSource, type TestRunRequest } from "@workspace/test-runtime/native";
import { activate } from "./index.js";

const cleanup: string[] = [];
const stateHash = "state:" + "c".repeat(64);
function sealed(overrides: Partial<TestRunRequest> = {}): TestRunRequest {
  const request = { target: "packages/fixture", suite: "unit", stateHash, ...overrides };
  const executionDigest = createHash("sha256").update(nativeTestExecutionSource(request)).digest("hex");
  return { ...request, artifactKey: `native:${executionDigest}`, executionDigest };
}

function fixture(runtime: "browser" | "native" = "native") {
  const projections = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-test-adapter-"),
  );
  cleanup.push(projections);
  const target = path.join(projections, "ctx-1", "packages", "fixture");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({
      name: "@workspace/fixture",
      vibestudio: {
        tests: [{ name: "unit", runtime, include: ["**/*.test.ts"] }],
      },
    }),
  );
  const ensureMaterialized = vi.fn(async () => path.join(projections, "ctx-1"));
  return {
    target,
    ensureMaterialized,
    ctx: {
      fs: { ensureMaterialized },
      rpc: {
        call: vi.fn(async () => ({
          stateHash, dependencyKey: null as string | null, nodeModulesPaths: [] as string[],
          workspacePackages: {} as Record<string, string>,
        })),
      },
      invocation: {
        current: () => ({ caller: { callerId: "agent", contextId: "ctx-1" } }),
      },
      log: { info: vi.fn() },
    },
  };
}

afterEach(() => {
  for (const directory of cleanup.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("native test adapter boundary", () => {
  it("rejects traversal before materialization", async () => {
    const { ctx, ensureMaterialized } = fixture();
    const api = await activate(ctx);
    await expect(
      api.runNative(sealed({ target: "../outside" })),
    ).rejects.toThrow("contained workspace unit path");
    expect(ensureMaterialized).not.toHaveBeenCalled();
  });

  it("refuses a browser suite instead of falling back", async () => {
    const { ctx } = fixture("browser");
    const api = await activate(ctx);
    await expect(
      api.runNative(sealed()),
    ).rejects.toThrow("fallback is forbidden");
  });

  it("requires the named suite to be declared", async () => {
    const { ctx } = fixture();
    const api = await activate(ctx);
    await expect(
      api.runNative(sealed({ suite: "missing" })),
    ).rejects.toThrow("Unknown declared test suite");
  });

  it("executes selected modules in a child using the installed test-engine dependencies", async () => {
    const { ctx, target } = fixture();
    fs.writeFileSync(
      path.join(target, "simple.test.ts"),
      'import { expect, it } from "vitest"; it("passes", () => expect(2 + 2).toBe(4));\n',
    );
    fs.writeFileSync(
      path.join(target, "unselected.test.ts"),
      'throw new Error("Unselected module must not execute");\n',
    );
    const api = await activate(ctx);
    const result = await api.runNative(sealed({ fileFilter: "simple.test.ts" }));
    expect(result).toMatchObject({
      status: "passed",
      passed: 1,
      failed: 0,
      total: 1,
    });
    const contextNodeModules = path.join(
      path.dirname(target),
      "..",
      "node_modules",
    );
    expect(
      fs.existsSync(contextNodeModules)
        ? fs.readdirSync(contextNodeModules, { recursive: true })
        : [],
    ).toEqual([]);
  });
  it.each([
    [
      "failed",
      'import { expect, it } from "vitest"; it("fails", () => expect(1).toBe(2));',
    ],
    ["no-tests", 'import { it } from "vitest"; it.skip("skipped", () => {});'],
  ] as const)(
    "returns the native %s terminal status",
    async (status, source) => {
      const { ctx, target } = fixture();
      fs.writeFileSync(path.join(target, "simple.test.ts"), source);
      const api = await activate(ctx);
      expect(
        await api.runNative(sealed()),
      ).toMatchObject({ status });
    },
  );

  it("rejects an unhandled engine error despite a passing test report", async () => {
    const { ctx, target } = fixture();
    fs.writeFileSync(
      path.join(target, "simple.test.ts"),
      'import { it } from "vitest"; it("partial pass", async () => { setTimeout(() => { throw new Error("unhandled native failure"); }, 0); await new Promise(resolve => setTimeout(resolve, 20)); });',
    );
    const api = await activate(ctx);
    await expect(
      api.runNative(sealed()),
    ).rejects.toThrow("verification did not complete");
  });

  it("runs a suite against its admitted package exports and declared Vitest environment", async () => {
    const { ctx, target } = fixture();
    const dependencies = path.join(path.dirname(target), "admitted");
    const modules = path.join(dependencies, "node_modules");
    const library = path.join(dependencies, "workspace-library");
    const environment = path.join(modules, "vitest-environment-fixture-dom");
    fs.mkdirSync(library, { recursive: true });
    fs.mkdirSync(environment, { recursive: true });
    fs.writeFileSync(path.join(library, "package.json"),
      JSON.stringify({ name: "@workspace/admitted", type: "module", exports: { "./test-kit": "./fixture.js" } }));
    fs.writeFileSync(path.join(library, "fixture.js"), "export const received = 42;");
    const shadow = path.join(target, "node_modules", "@workspace", "admitted");
    fs.mkdirSync(shadow, { recursive: true });
    fs.copyFileSync(path.join(library, "package.json"), path.join(shadow, "package.json"));
    fs.writeFileSync(path.join(shadow, "fixture.js"), "export const received = 0;");
    fs.writeFileSync(path.join(environment, "package.json"),
      JSON.stringify({ name: "vitest-environment-fixture-dom", type: "module", exports: "./index.js" }));
    fs.writeFileSync(path.join(environment, "index.js"),
      'export default { name: "fixture-dom", transformMode: "ssr", setup(global) { global.projected = true; return { teardown() { delete global.projected; } }; } };');
    fs.writeFileSync(path.join(target, "native.test.ts"),
      '// @vitest-' + 'environment fixture-dom\nimport { it, expect } from "vitest";\nimport { received } from "@workspace/admitted/test-kit";\nit("uses the declared realm", () => expect([globalThis.projected, received]).toEqual([true, 42]));');
    ctx.rpc.call.mockResolvedValueOnce({
      stateHash,
      dependencyKey: "admitted",
      nodeModulesPaths: [modules],
      workspacePackages: { "@workspace/admitted": library },
    });
    const api = await activate(ctx);
    const request = sealed();
    expect(await api.runNative(request)).toMatchObject({ status: "passed", passed: 1, dependencyKey: "admitted" });
    expect(ctx.rpc.call).toHaveBeenCalledWith("main", expect.anything(), ["packages/fixture", "ctx:ctx-1"]);
    await expect(api.runNative({ ...request, testName: "changed" })).rejects.toThrow("sealed execution identity");
    ctx.rpc.call.mockResolvedValueOnce({
      stateHash: "other-state", dependencyKey: null, nodeModulesPaths: [], workspacePackages: {},
    });
    await expect(api.runNative(request)).rejects.toThrow("plan changed");
  });
});
