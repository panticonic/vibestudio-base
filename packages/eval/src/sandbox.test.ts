import vm from "node:vm";
import { deserializeRpcFailure, formatRpcFailure } from "@vibestudio/rpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tameRealmCodegen } from "@vibestudio/shared/evalConfinement";
import { compileModule, executeSandbox } from "./sandbox";
import type { AsyncTrackingAPI } from "./asyncTracking";
import {
  Journal,
  withJournal,
  currentJournal,
} from "../../runtime/src/shared/journal.js";

describe("executeSandbox", () => {
  it("applies a declared package-root ref to the exact imported subpath", async () => {
    const loadImport = vi.fn(async () => ({
      format: "cjs" as const,
      requiredModules: [],
      bundle: "module.exports = { answer: 42 };",
    }));
    const result = await executeSandbox(
      'import { answer } from "@vibestudio/shared/rpcMethods"; return answer;',
      {
        syntax: "typescript",
        imports: { "@vibestudio/shared": "workspace:*" },
        loadImport,
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
    expect(loadImport).toHaveBeenCalledOnce();
    expect(loadImport).toHaveBeenCalledWith(
      "@vibestudio/shared/rpcMethods",
      "workspace:*",
      [],
    );
    expect(
      (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"],
    ).not.toHaveProperty("@vibestudio/shared");
  });

  it("uses the package-root ref when a compiled module imports only a subpath", async () => {
    const loadImport = vi.fn(async () => ({
      format: "cjs" as const,
      requiredModules: [],
      bundle: "module.exports = { answer: 42 };",
    }));
    const result = await compileModule(
      'import { answer } from "@vibestudio/shared/rpcMethods"; export const value = answer;',
      {
        syntax: "typescript",
        imports: { "@vibestudio/shared": "workspace:*" },
        loadImport,
      },
    );

    expect(result).toMatchObject({ success: true, module: { value: 42 } });
    expect(loadImport).toHaveBeenCalledOnce();
    expect(loadImport).toHaveBeenCalledWith(
      "@vibestudio/shared/rpcMethods",
      "workspace:*",
      [],
    );
    expect(
      (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"],
    ).not.toHaveProperty("@vibestudio/shared");
  });

  it("prefers an exact subpath ref and still preloads unused explicit imports", async () => {
    const loadImport = vi.fn(async () => ({
      format: "cjs" as const,
      requiredModules: [],
      bundle: "module.exports = { answer: 42 };",
    }));
    const result = await executeSandbox(
      'import { answer } from "@vibestudio/shared/rpcMethods"; return answer;',
      {
        syntax: "typescript",
        imports: {
          "@vibestudio/shared": "workspace:*",
          "@vibestudio/shared/rpcMethods": "workspace:rpc-contracts",
          "@workspace/unused": "workspace:unused",
        },
        loadImport,
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
    expect(loadImport.mock.calls).toEqual([
      ["@vibestudio/shared/rpcMethods", "workspace:rpc-contracts", []],
      [
        "@workspace/unused",
        "workspace:unused",
        ["@vibestudio/shared/rpcMethods"],
      ],
    ]);
    expect(
      (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"],
    ).not.toHaveProperty("@vibestudio/shared");
  });

  it.each([false, true])(
    "preserves completed operation receipts despite return projection or a later exception (%s)",
    async (failLater) => {
      const receipt = {
        protocol: "cdp-interaction-outcome.v1",
        delivery: "dispatched",
        action: "click",
        effect: { status: "observed", locator: "Count", state: "visible" },
      };
      const runtime = { journal: { Journal, with: withJournal } };
      const result = await executeSandbox(
        failLater
          ? `scope.action(); throw new Error("later statement failed")`
          : `return scope.action().effect`,
        {
          moduleMap: { "@workspace/runtime": runtime },
          require: (id) => {
            if (id === "@workspace/runtime") return runtime;
            throw new Error(id);
          },
          bindings: {
            scope: {
              action: () => {
                currentJournal()?.append({
                  type: "interaction",
                  id: "panel:test",
                  receipt,
                });
                return receipt;
              },
            },
          },
        },
      );
      expect(result.success).toBe(!failLater);
      expect(result.operationJournal).toEqual({
        protocol: "workspace-operations.v1",
        entries: [{ type: "interaction", id: "panel:test", receipt }],
        truncated: false,
      });
      if (failLater)
        expect(result.error?.message).toBe("later statement failed");
      else expect(result.returnValue).toEqual(receipt.effect);
    },
  );

  it("marks operation evidence incomplete when a receipt exceeds the wire budget", async () => {
    const runtime = { journal: { Journal, with: withJournal } };
    const result = await executeSandbox("scope.action()", {
      moduleMap: { "@workspace/runtime": runtime },
      require: (id) => {
        if (id === "@workspace/runtime") return runtime;
        throw new Error(id);
      },
      bindings: {
        scope: {
          action: () =>
            currentJournal()?.append({
              type: "interaction",
              id: "panel:test",
              receipt: { oversized: "x".repeat(30_000) },
            }),
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.operationJournal).toEqual({
      protocol: "workspace-operations.v1",
      entries: [],
      truncated: true,
    });
  });

  let originalModuleMap: unknown;
  let originalRequire: unknown;
  let originalAsyncRequire: unknown;
  let originalPreload: unknown;
  let originalModuleLoaders: unknown;
  let originalNativeImportSpecifiers: unknown;
  let originalLoadImport: unknown;
  let originalAsyncTracking: unknown;

  beforeEach(() => {
    originalModuleMap = (globalThis as Record<string, unknown>)[
      "__vibestudioModuleMap__"
    ];
    originalRequire = (globalThis as Record<string, unknown>)[
      "__vibestudioRequire__"
    ];
    originalAsyncRequire = (globalThis as Record<string, unknown>)[
      "__vibestudioRequireAsync__"
    ];
    originalPreload = (globalThis as Record<string, unknown>)[
      "__vibestudioPreloadModules__"
    ];
    originalModuleLoaders = (globalThis as Record<string, unknown>)[
      "__vibestudioModuleLoaders__"
    ];
    originalNativeImportSpecifiers = (globalThis as Record<string, unknown>)[
      "__vibestudioNativeImportSpecifiers__"
    ];
    originalLoadImport = (globalThis as Record<string, unknown>)[
      "__vibestudioLoadImport__"
    ];
    originalAsyncTracking = (globalThis as Record<string, unknown>)[
      "__vibestudioAsyncTracking__"
    ];

    const moduleMap: Record<string, unknown> = {};
    (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"] =
      moduleMap;
    (globalThis as Record<string, unknown>)["__vibestudioRequire__"] = (
      id: string,
    ) => {
      if (id in moduleMap) return moduleMap[id];
      throw new Error(`Module not found: ${id}`);
    };
    delete (globalThis as Record<string, unknown>)[
      "__vibestudioRequireAsync__"
    ];
    (globalThis as Record<string, unknown>)["__vibestudioModuleLoaders__"] = {};
    (globalThis as Record<string, unknown>)[
      "__vibestudioNativeImportSpecifiers__"
    ] = new Set();
    (globalThis as Record<string, unknown>)["__vibestudioPreloadModules__"] =
      async (ids: string[]) =>
        ids.map((id) => {
          if (id in moduleMap) return moduleMap[id];
          throw new Error(`Module not found: ${id}`);
        });
  });

  afterEach(() => {
    if (originalModuleMap === undefined)
      delete (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"];
    else
      (globalThis as Record<string, unknown>)["__vibestudioModuleMap__"] =
        originalModuleMap;
    if (originalRequire === undefined)
      delete (globalThis as Record<string, unknown>)["__vibestudioRequire__"];
    else
      (globalThis as Record<string, unknown>)["__vibestudioRequire__"] =
        originalRequire;
    if (originalAsyncRequire === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioRequireAsync__"
      ];
    else
      (globalThis as Record<string, unknown>)["__vibestudioRequireAsync__"] =
        originalAsyncRequire;
    if (originalPreload === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioPreloadModules__"
      ];
    else
      (globalThis as Record<string, unknown>)["__vibestudioPreloadModules__"] =
        originalPreload;
    if (originalModuleLoaders === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioModuleLoaders__"
      ];
    else
      (globalThis as Record<string, unknown>)["__vibestudioModuleLoaders__"] =
        originalModuleLoaders;
    if (originalNativeImportSpecifiers === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioNativeImportSpecifiers__"
      ];
    else
      (globalThis as Record<string, unknown>)[
        "__vibestudioNativeImportSpecifiers__"
      ] = originalNativeImportSpecifiers;
    if (originalLoadImport === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioLoadImport__"
      ];
    else
      (globalThis as Record<string, unknown>)["__vibestudioLoadImport__"] =
        originalLoadImport;
    if (originalAsyncTracking === undefined)
      delete (globalThis as Record<string, unknown>)[
        "__vibestudioAsyncTracking__"
      ];
    else
      (globalThis as Record<string, unknown>)["__vibestudioAsyncTracking__"] =
        originalAsyncTracking;
  });

  it("settles a rejected top-level result without waiting on unrelated tracked work", async () => {
    const context = {
      id: 1,
      promises: new Set<Promise<unknown>>(),
      pauseCount: 0,
    };
    const tracking: AsyncTrackingAPI = {
      start: () => context,
      enter: () => undefined,
      exit: () => undefined,
      stop: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      ignore: <T>(value: T) => value,
      waitAll: () => new Promise<void>(() => undefined),
      pending: () => 0,
      activeContexts: () => [context.id],
    };
    (globalThis as Record<string, unknown>)["__vibestudioAsyncTracking__"] =
      tracking;

    await expect(
      executeSandbox(
        'await Promise.resolve(); throw new Error("terminal eval failure");',
        {
          syntax: "typescript",
        },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({ message: "terminal eval failure" }),
    });
  });

  it("preserves repeated references and marks only recursive ancestry as circular", async () => {
    const result = await executeSandbox(
      `const device = { id: "phone", platform: "android" };
       const cycle = { device }; cycle.self = cycle;
       return { summary: { device }, receipt: { device }, items: [device, device], cycle };`,
      { syntax: "typescript" },
    );
    expect(result).toMatchObject({
      success: true,
      returnValue: {
        summary: { device: { id: "phone", platform: "android" } },
        receipt: { device: { id: "phone", platform: "android" } },
        items: [
          { id: "phone", platform: "android" },
          { id: "phone", platform: "android" },
        ],
        cycle: {
          device: { id: "phone", platform: "android" },
          self: "[Circular]",
        },
      },
    });
  });

  it("settles a pending async eval when its signal is aborted", async () => {
    const controller = new AbortController();
    const pending = executeSandbox("return await new Promise(() => {});", {
      syntax: "typescript",
      signal: controller.signal,
    });

    controller.abort("User interrupted execution");

    await expect(pending).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({ message: "User interrupted execution" }),
    });
  });

  it("retains a structured guest callback failure when it aborts a pending eval", async () => {
    const controller = new AbortController();
    const pending = executeSandbox("return await new Promise(() => {});", {
      syntax: "typescript",
      signal: controller.signal,
    });
    const error = Object.assign(new Error("callback failed"), {
      errorData: {
        code: "guest_callback_error",
        failureKind: "user-code",
        message: "callback failed",
      },
    });

    controller.abort(error);

    await expect(pending).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "callback failed",
        errorData: expect.objectContaining({
          code: "guest_callback_error",
          failureKind: "user-code",
          message: "callback failed",
        }),
      }),
      failureKind: "user-code",
      failureCode: "guest_callback_error",
    });
  });

  it("fails fast when the signal is already aborted before execution", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeSandbox("return 21 + 21;", {
      syntax: "typescript",
      signal: controller.signal,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("completes normally when an unaborted signal is provided", async () => {
    const controller = new AbortController();
    const result = await executeSandbox("return 1 + 2;", {
      syntax: "typescript",
      signal: controller.signal,
    });
    expect(result.success).toBe(true);
    expect(result.returnValue).toBe(3);
  });

  it("preserves an explicit null return instead of falling back to the default export", async () => {
    const result = await executeSandbox(
      `export default "fallback";
return null;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: null });
  });

  it("uses the default export when the eval returns undefined", async () => {
    const result = await executeSandbox(
      `export default "fallback";
return undefined;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: "fallback" });
  });

  it("propagates private-global confinement through the transformed sandbox", async () => {
    // Confinement requires a realm that cannot compile code; node:vm stands in
    // for the codegen-free evaluator isolate.
    const guestContext = vm.createContext({});
    tameRealmCodegen(
      vm.runInContext("globalThis", guestContext) as Record<string, unknown>,
    );
    const result = await executeSandbox(
      `return { processType: typeof process, fetchType: typeof fetch, answer: seed + 1 };`,
      {
        syntax: "typescript",
        bindings: { seed: 41 },
        confinement: "private-global",
        compileFunction: (argNames, body) =>
          vm.runInContext(
            `(function (${argNames.join(", ")}) {\n${body}\n})`,
            guestContext,
          ) as (...args: unknown[]) => unknown,
      },
    );

    expect(result).toMatchObject({
      success: true,
      returnValue: {
        processType: "undefined",
        fetchType: "undefined",
        answer: 42,
      },
    });
  });

  it("confines and freezes relative source module namespaces before publishing their exports", async () => {
    const guestContext = vm.createContext({ evaluatorSecret: "LEAKED" });
    tameRealmCodegen(
      vm.runInContext("globalThis", guestContext) as Record<string, unknown>,
    );
    const moduleMap: Record<string, unknown> = {};
    const freezeModuleNamespace = vi.fn(<T>(value: T): T => {
      if (
        (typeof value === "object" && value !== null) ||
        typeof value === "function"
      ) {
        Object.freeze(value);
      }
      return value;
    });
    const result = await executeSandbox(
      `import { observedSecret } from "./helper"; return observedSecret;`,
      {
        syntax: "typescript",
        sourcePath: "src/main.ts",
        sourceFiles: {
          "src/main.ts": `import { observedSecret } from "./helper"; return observedSecret;`,
          "src/helper.ts": `export const observedSecret = typeof evaluatorSecret;`,
        },
        moduleMap,
        require: (id) => {
          if (id in moduleMap) return moduleMap[id];
          throw new Error(`Module not found: ${id}`);
        },
        confinement: "private-global",
        compileFunction: (argNames, body) =>
          vm.runInContext(
            `(function (${argNames.join(", ")}) {\n${body}\n})`,
            guestContext,
          ) as (...args: unknown[]) => unknown,
        freezeModuleNamespace,
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: "undefined" });
    expect(freezeModuleNamespace).toHaveBeenCalled();
    expect(Object.isFrozen(moduleMap["src/helper.ts"])).toBe(true);
  });

  it("settles synchronous loops at an explicit cooperative deadline", async () => {
    const timeoutMs = 5;
    const result = await executeSandbox("while (true) {}", {
      syntax: "typescript",
      deadline: { atMs: Date.now() + timeoutMs, timeoutMs },
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: `eval timed out after ${timeoutMs}ms`,
      }),
    });
  });

  it("settles synchronous recursion at an explicit cooperative deadline", async () => {
    const timeoutMs = 5;
    const result = await executeSandbox(
      "function recurse() { return recurse(); } return recurse();",
      {
        syntax: "typescript",
        deadline: { atMs: Date.now(), timeoutMs },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: `eval timed out after ${timeoutMs}ms`,
      }),
    });
  });

  it("does not instrument synchronous code when no deadline is supplied", async () => {
    const result = await executeSandbox(
      "let n = 0; while (n < 3) n += 1; const f = (x) => x + 1; return f(n);",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: 4 });
  });

  it("deactivates checkpoints captured by functions that outlive a bounded run", async () => {
    const holder: { fn?: () => number } = {};
    const result = await executeSandbox(
      "holder.fn = () => 42; return 'stored';",
      {
        syntax: "typescript",
        bindings: { holder },
        deadline: { atMs: Date.now() + 50, timeoutMs: 50 },
      },
    );
    expect(result).toMatchObject({ success: true, returnValue: "stored" });

    await new Promise((resolve) => setTimeout(resolve, 55));
    expect(holder.fn?.()).toBe(42);
  });

  it("awaits a trailing async IIFE as the eval result", async () => {
    const result = await executeSandbox(
      "(async () => { await Promise.resolve(); return 42; })();",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
  });

  it("returns a trailing object literal like a notebook REPL", async () => {
    const result = await executeSandbox(
      "const path = 'probe.txt';\nconst actorId = 'agent:1';\n{ path, actorId, turnId: 'turn:1' }",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: true,
      returnValue: { path: "probe.txt", actorId: "agent:1", turnId: "turn:1" },
    });
  });

  it("returns any trailing expression like a notebook REPL", async () => {
    const result = await executeSandbox(
      "function factorial(n: number): number { return n <= 1 ? 1 : n * factorial(n - 1); }\nconst value = factorial(5);\nvalue;",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: 120 });
  });

  it("does not replace an explicit return with an earlier expression", async () => {
    const result = await executeSandbox(
      "const value = 6 * 7;\nvalue;\nreturn 'explicit';",
      {
        syntax: "typescript",
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: "explicit" });
  });

  it("repairs transport-escaped whitespace outside literals", async () => {
    const result = await executeSandbox(
      String.raw`return { first: 1,\n second: 2, text: "keep,\\n literal" };`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: true,
      returnValue: { first: 1, second: 2, text: "keep,\\n literal" },
    });
  });

  it("repairs a missing call parenthesis before a line-ending semicolon", async () => {
    const result = await executeSandbox(
      "const list = [{repoPath: 'demo'}];\nconsole.log(JSON.stringify({count:list.length, repos:list.map(s=>s.repoPath)});\nreturn list.length;",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: 1 });
  });

  it("repairs a missing outer call parenthesis after a multiline nested expression", async () => {
    const result = await executeSandbox(
      `const page = { evaluate: (fn: () => unknown) => fn() };
       const data = await page.evaluate(() => [{title: "List"}].map((list, listIndex) => ({
         title: list.title,
         position: listIndex,
         cards: [{title: "Card"}].map((card, cardIndex) => {
           return {title: card.title, position: cardIndex};
         })
       }));
       return data;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: true,
      returnValue: [
        { title: "List", position: 0, cards: [{ title: "Card", position: 0 }] },
      ],
    });
  });

  it("does not treat parentheses inside a regular-expression literal as unmatched calls", async () => {
    const result = await executeSandbox(
      'const value = /\\(/.test("("); return value;',
      {
        syntax: "typescript",
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: true });
  });

  it("repairs a leaked tool-call JSON suffix after otherwise complete code", async () => {
    const result = await executeSandbox(
      'const value = 41;\nreturn value + 1;\n"}',
      {
        syntax: "typescript",
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
  });

  it("lifts direct node:fs sync calls to awaited portable operations", async () => {
    const files = new Map<string, string | Uint8Array>();
    const nodeFs = {
      async writeFile(path: string, data: string | Uint8Array) {
        files.set(path, data);
      },
      async readFile(path: string) {
        return files.get(path);
      },
      async unlink(path: string) {
        files.delete(path);
      },
    };
    (nodeFs as Record<string, unknown>)["default"] = nodeFs;
    const moduleMap = { "node:fs": nodeFs };

    const result = await executeSandbox(
      "import fs from 'node:fs';\nfs.writeFileSync('/tmp/a', 'hello');\nconst text = fs.readFileSync('/tmp/a');\nfs.unlinkSync('/tmp/a');\nreturn { text, gone: !files.has('/tmp/a') };",
      {
        syntax: "typescript",
        bindings: { files },
        moduleMap,
        require: (id) => moduleMap[id as keyof typeof moduleMap],
      },
    );

    expect(
      result.success,
      result.error
        ? formatRpcFailure(deserializeRpcFailure(result.error))
        : undefined,
    ).toBe(true);
    expect(result.returnValue).toEqual({ text: "hello", gone: true });
  });

  it("never injects await into a nested synchronous helper while lifting outer fs calls", async () => {
    const files = new Map<string, string>();
    const links = new Map<string, string>();
    const nodeFs = {
      async writeFile(path: string, data: string) {
        files.set(path, data);
      },
      async symlink(target: string, path: string) {
        links.set(path, target);
      },
      async readFile(path: string) {
        return files.get(links.get(path) ?? path);
      },
    };
    (nodeFs as Record<string, unknown>)["default"] = nodeFs;
    const moduleMap = { "node:fs": nodeFs };

    const result = await executeSandbox(
      `import fs from "node:fs";
function cleanup(path: string) {
  try { if (fs.existsSync(path)) fs.unlinkSync(path); } catch {}
}
cleanup("/tmp/link");
fs.writeFileSync("/tmp/target", "ok");
fs.symlinkSync("/tmp/target", "/tmp/link", "file");
return fs.readFileSync("/tmp/link");`,
      {
        syntax: "typescript",
        moduleMap,
        require: (id) => moduleMap[id as keyof typeof moduleMap],
      },
    );

    expect(
      result.success,
      result.error
        ? formatRpcFailure(deserializeRpcFailure(result.error))
        : undefined,
    ).toBe(true);
    expect(result.returnValue).toBe("ok");
  });

  it("never injects await into an expression-bodied synchronous arrow", async () => {
    const nodeFs = {
      async writeFile() {},
    };
    (nodeFs as Record<string, unknown>)["default"] = nodeFs;
    const moduleMap = { "node:fs": nodeFs };

    const result = await executeSandbox(
      `import fs from "node:fs";
const write = () => fs.writeFileSync("/tmp/value", "ok");
return typeof write;`,
      {
        syntax: "typescript",
        moduleMap,
        require: (id) => moduleMap[id as keyof typeof moduleMap],
      },
    );

    expect(
      result.success,
      result.error
        ? formatRpcFailure(deserializeRpcFailure(result.error))
        : undefined,
    ).toBe(true);
    expect(result.returnValue).toBe("function");
  });

  it("accepts JavaScript syntax and lifts bare require('fs') calls", async () => {
    const files = new Map<string, string>();
    const fsModule = {
      async writeFile(path: string, data: string) {
        files.set(path, data);
      },
      async readFile(path: string) {
        return files.get(path);
      },
    };
    const moduleMap = { fs: fsModule };
    const result = await executeSandbox(
      `const fs = require("fs");
fs.writeFileSync("/tmp/a", "ok");
return fs.readFileSync("/tmp/a");`,
      {
        syntax: "javascript",
        moduleMap,
        require: (id) => moduleMap[id as keyof typeof moduleMap],
      },
    );

    expect(
      result.success,
      result.error
        ? formatRpcFailure(deserializeRpcFailure(result.error))
        : undefined,
    ).toBe(true);
    expect(result.returnValue).toBe("ok");
  });

  it("does not alter semicolons in a valid for header", async () => {
    const result = await executeSandbox(
      "let total = 0; for (let i = 0; i < 3; i++) total += i; return total;",
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({ success: true, returnValue: 3 });
  });

  it("does not suggest npm imports for unavailable Node built-ins", async () => {
    const result = await executeSandbox(
      'import { spawn } from "node:child_process"; return spawn;',
      {
        syntax: "typescript",
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain(
      'Node built-in module "node:child_process" is not available',
    );
    expect(result.error?.message).toContain("@workspace/runtime");
    expect(result.error?.message).not.toContain("npm:latest");
    expect(result).toMatchObject({
      failureKind: "user-code",
      failureCode: "unsupported_node_module",
    });
  });

  it("classifies package build/link failures as infrastructure failures", async () => {
    const result = await executeSandbox(
      'import { answer } from "@workspace/broken"; return answer;',
      {
        syntax: "typescript",
        imports: { "@workspace/broken": "workspace:*" },
        loadImport: async () => {
          throw new Error("worker export uses an unsupported module feature");
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "worker export uses an unsupported module feature",
      }),
      failureKind: "infrastructure",
      failureCode: "package_load_failed",
    });
  });

  it("keeps an invalid workspace build selector caller-correctable", async () => {
    const result = await executeSandbox(
      'import { answer } from "@workspace/example"; return answer;',
      {
        syntax: "typescript",
        imports: { "@workspace/example": "./packages/example/src/index.ts" },
        loadImport: async () => {
          throw Object.assign(new Error("Invalid build ref"), {
            errorKind: "application",
            code: "invalid_build_ref",
            errorData: {
              code: "invalid_build_ref",
              ref: "./packages/example/src/index.ts",
            },
          });
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "Invalid build ref",
        errorData: expect.objectContaining({
          code: "invalid_build_ref",
          ref: "./packages/example/src/index.ts",
        }),
      }),
      failureKind: "user-code",
      failureCode: "invalid_build_ref",
    });
  });

  it("preserves an unexpected test-policy failure across module loading", async () => {
    const result = await executeSandbox(
      'import "typescript"; return "unreachable";',
      {
        syntax: "typescript",
        imports: { typescript: "npm:latest" },
        loadImport: async () => {
          throw Object.assign(
            new Error("Unexpected authority prompt in system test"),
            {
              errorKind: "application",
              code: "EUNEXPECTEDTESTPROMPT",
              errorData: {
                code: "EUNEXPECTEDTESTPROMPT",
                failureKind: "user-code",
              },
            },
          );
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "Unexpected authority prompt in system test",
      }),
      failureKind: "infrastructure",
      failureCode: "EUNEXPECTEDTESTPROMPT",
    });
  });

  it("keeps a conflicting retained module execution caller-correctable", async () => {
    const result = await executeSandbox(
      'import { answer } from "@workspace/example"; return answer;',
      {
        syntax: "typescript",
        imports: {
          "@workspace/example": "workspace:packages/example/src/index.ts",
        },
        loadImport: async () => {
          throw Object.assign(
            new Error("Module is retained at another execution"),
            {
              errorKind: "application",
              code: "eval_module_execution_conflict",
              errorData: {
                code: "eval_module_execution_conflict",
                moduleSpecifier: "@workspace/example",
                failureKind: "user-code",
              },
            },
          );
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "Module is retained at another execution",
        errorData: expect.objectContaining({
          code: "eval_module_execution_conflict",
          moduleSpecifier: "@workspace/example",
          failureKind: "user-code",
        }),
      }),
      failureKind: "user-code",
      failureCode: "eval_module_execution_conflict",
    });
  });

  it("loads a lazy panel-exposed module before workspace build fallback", async () => {
    const globals = globalThis as Record<string, unknown>;
    const moduleMap = globals["__vibestudioModuleMap__"] as Record<
      string,
      unknown
    >;
    const loaders = globals["__vibestudioModuleLoaders__"] as Record<
      string,
      () => Promise<unknown>
    >;
    const jsxRuntime = { marker: "host jsx runtime" };
    loaders["react/jsx-runtime"] = async () => {
      moduleMap["react/jsx-runtime"] = jsxRuntime;
      return jsxRuntime;
    };
    globals["__vibestudioRequireAsync__"] = async (id: string) => {
      const loaded = moduleMap[id] ?? (await loaders[id]?.());
      if (loaded === undefined)
        throw new Error(`Module "${id}" has no generated loader`);
      moduleMap[id] = loaded;
      return loaded;
    };
    const loadImport = vi.fn();

    const result = await executeSandbox(
      'import * as runtime from "react/jsx-runtime"; return runtime.marker;',
      {
        syntax: "typescript",
        imports: { "react/jsx-runtime": "latest" },
        loadImport,
      },
    );

    expect(result).toMatchObject({
      success: true,
      returnValue: "host jsx runtime",
    });
    expect(loadImport).not.toHaveBeenCalled();
  });

  it.each(["cjs", "async-cjs"] as const)(
    "links a %s library's lazy host peers before initializing it",
    async (format) => {
      const globals = globalThis as Record<string, unknown>;
      const moduleMap = globals["__vibestudioModuleMap__"] as Record<
        string,
        unknown
      >;
      const react = { marker: "the panel's React" };
      const loadReact = vi.fn(async () => {
        moduleMap["react"] = react;
        return react;
      });
      (globals["__vibestudioModuleLoaders__"] as Record<string, unknown>)[
        "react"
      ] = loadReact;
      globals["__vibestudioRequireAsync__"] = (id: string) => {
        if (id !== "react")
          throw new Error(`Unexpected host dependency: ${id}`);
        return loadReact();
      };
      const loadImport = vi.fn(async () => ({
        format,
        requiredModules: ["react"],
        // esbuild's ESM output routes CommonJS peers through this helper.
        // Its indirect call cannot be recovered by scanning direct require().
        bundle:
          'var __require = (...args) => require(...args); module.exports = { peer: __require("react") };',
      }));
      const result = await executeSandbox(
        'import { peer } from "@workspace/widget"; return peer.marker;',
        {
          syntax: "typescript",
          imports: { "@workspace/widget": "latest" },
          loadImport,
        },
      );
      expect(result).toMatchObject({
        success: true,
        returnValue: "the panel's React",
      });
      expect(loadReact).toHaveBeenCalledOnce();
      expect(loadImport).toHaveBeenCalledOnce();
      expect((moduleMap["@workspace/widget"] as { peer: unknown }).peer).toBe(
        react,
      );
    },
  );

  it("keeps a library's dynamic host peers lazy and uses the same module owner", async () => {
    const globals = globalThis as Record<string, unknown>;
    const moduleMap = globals["__vibestudioModuleMap__"] as Record<
      string,
      unknown
    >;
    const react = { marker: "the panel's React" };
    const loadReact = vi.fn(async () => {
      moduleMap["react"] = react;
      return react;
    });
    (globals["__vibestudioModuleLoaders__"] as Record<string, unknown>)[
      "react"
    ] = loadReact;
    globals["__vibestudioRequireAsync__"] = loadReact;
    const loadImport = vi.fn(async () => ({
      format: "async-cjs" as const,
      requiredModules: [],
      bundle: 'module.exports = { load: () => __vibestudioImport("react") };',
    }));
    const options = { imports: { "@workspace/widget": "latest" }, loadImport };
    expect(
      await executeSandbox(
        'import "@workspace/widget"; return "ready";',
        options,
      ),
    ).toMatchObject({ success: true, returnValue: "ready" });
    expect(loadReact).not.toHaveBeenCalled();
    expect(
      await executeSandbox(
        'return (await require("@workspace/widget").load()).marker;',
        options,
      ),
    ).toMatchObject({ success: true, returnValue: "the panel's React" });
    expect(loadReact).toHaveBeenCalledOnce();
    expect(loadImport).toHaveBeenCalledOnce();
  });

  it("preserves a library peer loader failure without building a replacement", async () => {
    const globals = globalThis as Record<string, unknown>;
    const failure = new Error("React chunk disconnected");
    (globals["__vibestudioModuleLoaders__"] as Record<string, unknown>)[
      "react"
    ] = async () => {
      throw failure;
    };
    globals["__vibestudioRequireAsync__"] = async () => {
      throw failure;
    };
    const loadImport = vi.fn(async () => ({
      format: "cjs" as const,
      requiredModules: ["react"],
      bundle: 'module.exports = require("react");',
    }));
    const result = await executeSandbox('import "@workspace/widget";', {
      imports: { "@workspace/widget": "latest" },
      loadImport,
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({ message: failure.message }),
      failureKind: "infrastructure",
      failureCode: "package_load_failed",
    });
    expect(loadImport).toHaveBeenCalledOnce();
  });

  it.each([false, null, 0, "", undefined])(
    "reuses an acquired library exporting %j",
    async (value) => {
      const moduleMap: Record<string, unknown> = {};
      const loadImport = vi.fn(async () => ({
        format: "cjs" as const,
        requiredModules: [],
        bundle: `module.exports = ${value === undefined ? "undefined" : JSON.stringify(value)};`,
      }));
      const options = {
        imports: { "@workspace/widget": "latest" },
        moduleMap,
        require: (id: string) => {
          if (Object.hasOwn(moduleMap, id)) return moduleMap[id];
          throw new Error(`Module missing: ${id}`);
        },
        loadImport,
      };
      for (let iteration = 0; iteration < 2; iteration++) {
        const result = await executeSandbox(
          'return require("@workspace/widget");',
          options,
        );
        expect(result.success).toBe(true);
        expect(moduleMap["@workspace/widget"]).toBe(value);
      }
      expect(loadImport).toHaveBeenCalledOnce();
    },
  );

  it("does not link a private library against the ambient panel's peers", async () => {
    const globals = globalThis as Record<string, unknown>;
    const loadReact = vi.fn(async () => ({ marker: "ambient React" }));
    (globals["__vibestudioModuleLoaders__"] as Record<string, unknown>)[
      "react"
    ] = loadReact;
    globals["__vibestudioRequireAsync__"] = loadReact;
    const moduleMap: Record<string, unknown> = {};
    const result = await executeSandbox('import "@workspace/widget";', {
      moduleMap,
      require: (id) => {
        if (id in moduleMap) return moduleMap[id];
        throw new Error(`Private module missing: ${id}`);
      },
      imports: { "@workspace/widget": "latest" },
      loadImport: async () => ({
        format: "cjs",
        requiredModules: ["react"],
        bundle: 'module.exports = require("react");',
      }),
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "Private module missing: react",
      }),
    });
    expect(loadReact).not.toHaveBeenCalled();
    expect(moduleMap).toEqual({});
  });

  it("tracks build-loaded refs independently in each module registry", async () => {
    const firstModuleMap: Record<string, unknown> = {};
    const secondModuleMap: Record<string, unknown> = {};
    const loadImport = vi.fn(
      async (_specifier: string, ref: string | undefined) => ({
        bundle: `module.exports = { label: ${JSON.stringify(ref ?? "latest")} };`,
        format: "cjs" as const,
        requiredModules: [],
      }),
    );
    const runWithRef = (moduleMap: Record<string, unknown>, ref: string) =>
      executeSandbox('import { label } from "versioned-lib"; return label;', {
        syntax: "typescript",
        imports: { "versioned-lib": ref },
        moduleMap,
        require: (id) => {
          if (id in moduleMap) return moduleMap[id];
          throw new Error(`Module not found: ${id}`);
        },
        loadImport,
      });

    await expect(runWithRef(firstModuleMap, "npm:1")).resolves.toMatchObject({
      success: true,
      returnValue: "npm:1",
    });
    await expect(runWithRef(secondModuleMap, "npm:2")).resolves.toMatchObject({
      success: true,
      returnValue: "npm:2",
    });
    await expect(runWithRef(firstModuleMap, "npm:2")).resolves.toMatchObject({
      success: true,
      returnValue: "npm:2",
    });
    await expect(runWithRef(firstModuleMap, "npm:2")).resolves.toMatchObject({
      success: true,
      returnValue: "npm:2",
    });
    expect(loadImport.mock.calls.map(([, ref]) => ref)).toEqual([
      "npm:1",
      "npm:2",
      "npm:2",
    ]);
  });

  it("does not mask a lazy exposed-chunk failure with build fallback", async () => {
    const globals = globalThis as Record<string, unknown>;
    const loaders = globals["__vibestudioModuleLoaders__"] as Record<
      string,
      () => Promise<unknown>
    >;
    loaders["react/jsx-runtime"] = async () => {
      throw new Error("exposed module chunk failed");
    };
    globals["__vibestudioRequireAsync__"] = (id: string) => loaders[id]!();
    const loadImport = vi.fn();

    const result = await executeSandbox(
      'import "react/jsx-runtime"; return "unreachable";',
      {
        syntax: "typescript",
        imports: { "react/jsx-runtime": "latest" },
        loadImport,
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "exposed module chunk failed",
      }),
      failureKind: "infrastructure",
      failureCode: "package_load_failed",
    });
    expect(loadImport).not.toHaveBeenCalled();
  });

  it("classifies an acquired package's initialization error as correctable user code", async () => {
    const result = await executeSandbox(
      'import "@workspace/panel-only"; return "unreachable";',
      {
        syntax: "typescript",
        imports: { "@workspace/panel-only": "workspace:*" },
        loadImport: async () => ({
          format: "cjs",
          requiredModules: [],
          bundle:
            'throw new Error("This package requires a panel runtime global that is unavailable here");',
        }),
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message:
          "This package requires a panel runtime global that is unavailable here",
      }),
      failureKind: "user-code",
      failureCode: "guest_execution_failed",
    });
  });

  it("keeps a structured invalid package subpath correctable", async () => {
    const result = await executeSandbox(
      'import panel from "@workspace/runtime/panel"; return panel;',
      {
        syntax: "typescript",
        imports: { "@workspace/runtime/panel": "workspace:*" },
        loadImport: async () => {
          throw Object.assign(
            new Error("No export ./panel found for @workspace/runtime"),
            {
              errorData: {
                code: "package_export_not_found",
                packageName: "@workspace/runtime",
                subpath: "./panel",
                conditions: ["worker", "workerd", "default"],
              },
            },
          );
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "No export ./panel found for @workspace/runtime",
        errorData: expect.objectContaining({
          code: "package_export_not_found",
          packageName: "@workspace/runtime",
          subpath: "./panel",
          conditions: ["worker", "workerd", "default"],
        }),
      }),
      failureKind: "user-code",
      failureCode: "package_export_not_found",
    });
  });

  it("retains the host-owned operation journal without exposing it through guest journal state", async () => {
    const guestJournal = {
      Journal: class {},
      with: vi.fn(),
      current: () => null,
    };
    const hostJournal = {
      entries: [
        { type: "build.profile", receipt: { stateHash: "state:exact" } },
      ],
      truncated: false,
    };
    const result = await executeSandbox("return { measured: true };", {
      syntax: "typescript",
      operationJournal: hostJournal,
      require: () => ({ journal: guestJournal }),
    });
    expect(result).toMatchObject({
      success: true,
      returnValue: { measured: true },
      operationJournal: {
        protocol: "workspace-operations.v1",
        entries: hostJournal.entries,
        truncated: false,
      },
    });
    expect(guestJournal.with).not.toHaveBeenCalled();
    expect(guestJournal.current()).toBeNull();
  });

  it("keeps guest exceptions distinct from infrastructure failures", async () => {
    const result = await executeSandbox('throw new Error("authored boom")', {
      syntax: "typescript",
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({ message: "authored boom" }),
      failureKind: "user-code",
      failureCode: "guest_execution_failed",
    });
  });

  it("classifies guest TypeErrors as correctable code failures", async () => {
    const result = await executeSandbox(
      "const cdp: any = {}; return cdp.evaluate();",
      {
        syntax: "typescript",
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: expect.stringContaining("is not a function"),
      }),
      failureKind: "user-code",
      failureCode: "guest_type_error",
    });
  });

  it("keeps a runtime test-policy rejection distinct from guest code", async () => {
    const rejectPolicy = () => {
      throw Object.assign(
        new Error("Unexpected authority prompt in system test"),
        {
          errorKind: "application",
          code: "EUNEXPECTEDTESTPROMPT",
        },
      );
    };
    const result = await executeSandbox("rejectPolicy();", {
      syntax: "typescript",
      bindings: { rejectPolicy },
    });
    expect(result).toMatchObject({
      success: false,
      failureKind: "infrastructure",
      failureCode: "EUNEXPECTEDTESTPROMPT",
    });
  });

  it("classifies structured Durable Object schema refusals as infrastructure", async () => {
    const result = await executeSandbox(
      `const error = new Error("ExampleStore cannot open persisted schema v1 with build schema v2");
       error.code = "DO_SCHEMA_INCOMPATIBLE";
       error.errorKind = "service";
       error.errorData = {
         reason: "migration-missing",
         persistedVersion: 1,
         targetVersion: 2,
         safeActions: ["add-migration", "reset-storage"]
       };
       throw error;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: false,
      failureKind: "infrastructure",
      failureCode: "DO_SCHEMA_INCOMPATIBLE",
      error: expect.objectContaining({
        errorData: expect.objectContaining({
          reason: "migration-missing",
          persistedVersion: 1,
          targetVersion: 2,
        }),
      }),
    });
  });

  it("preserves structured guest failure data for agent-facing diagnostics", async () => {
    const result = await executeSandbox(
      `const error = new Error("publication failed");
       error.errorData = {
         code: "candidate_verification_failed",
         stage: "push",
         committedEventId: "event:committed",
         published: false
       };
       throw error;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        message: "publication failed",
        errorData: expect.objectContaining({
          code: "candidate_verification_failed",
          stage: "push",
          committedEventId: "event:committed",
          published: false,
        }),
      }),
      failureKind: "user-code",
      failureCode: "candidate_verification_failed",
    });
    expect(result.consoleOutput).not.toContain("[eval] Error stack:");
  });

  it("retains stacks for unstructured guest exceptions", async () => {
    const streamed: string[] = [];
    const result = await executeSandbox('throw new Error("authored boom")', {
      syntax: "typescript",
      onConsole: (formatted) => streamed.push(formatted),
    });

    expect(result.consoleOutput).toContain("[eval] Error stack:");
    expect(streamed).toHaveLength(1);
    expect(streamed[0]).toContain("[eval] Error stack:");
    expect(streamed[0]).toContain("authored boom");
  });

  it("honors a structured failure's declared cross-tool classification", async () => {
    const result = await executeSandbox(
      `const error = new Error("target connection closed");
       error.errorData = {
         code: "cdp_target_closed",
         failureKind: "infrastructure",
         recovery: { action: "reacquire-handle", instruction: "Reacquire the page." }
       };
       throw error;`,
      { syntax: "typescript" },
    );

    expect(result).toMatchObject({
      success: false,
      failureKind: "infrastructure",
      failureCode: "cdp_target_closed",
      error: expect.objectContaining({
        errorData: expect.objectContaining({
          recovery: {
            action: "reacquire-handle",
            instruction: "Reacquire the page.",
          },
        }),
      }),
    });
  });

  it("exposes a lazy import loader to runtime helpers during eval", async () => {
    const result = await executeSandbox(
      "const loaded = await globalThis.__vibestudioLoadImport__('lazy-package', 'latest'); return loaded.answer;",
      {
        syntax: "typescript",
        loadImport: async (specifier, ref, externals) => {
          expect(specifier).toBe("lazy-package");
          expect(ref).toBeUndefined();
          expect(externals).toEqual([]);
          return {
            bundle: "module.exports = { answer: 42 };",
            format: "cjs" as const,
            requiredModules: [],
          };
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.returnValue).toBe(42);
    expect(
      (globalThis as Record<string, unknown>)["__vibestudioLoadImport__"],
    ).toBeUndefined();
  });

  it("auto-loads an unscoped manifest-declared workspace unit", async () => {
    const streamed: string[] = [];
    const resolveWorkspaceImport = vi.fn(
      async (specifier: string) => specifier === "local-worker",
    );
    const loadImport = Object.assign(
      vi.fn(async (specifier: string, ref: string | undefined) => {
        expect(specifier).toBe("local-worker");
        expect(ref).toBeUndefined();
        return {
          bundle: "module.exports = { answer: 42 };",
          format: "cjs" as const,
          requiredModules: [],
        };
      }),
      { resolveWorkspaceImport },
    );

    const result = await executeSandbox(
      'import { answer } from "local-worker"; return answer;',
      {
        syntax: "typescript",
        loadImport,
        onConsole: (formatted) => streamed.push(formatted),
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
    expect(resolveWorkspaceImport).toHaveBeenCalledWith("local-worker");
    expect(loadImport).toHaveBeenCalledOnce();
    expect(result.consoleOutput).toContain(
      "[eval] Auto-loading: local-worker...",
    );
    expect(streamed).toContain("[eval] Auto-loading: local-worker...");
  });

  it("keeps unknown npm packages on the explicit npm import path", async () => {
    const resolveWorkspaceImport = vi.fn(async () => false);
    const loadImport = Object.assign(vi.fn(), { resolveWorkspaceImport });

    const result = await executeSandbox(
      'import pad from "left-pad"; return pad;',
      {
        syntax: "typescript",
        loadImport,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Module "left-pad" not available');
    expect(result.error?.message).toContain('"left-pad":"npm:latest"');
    expect(result).toMatchObject({
      failureKind: "user-code",
      failureCode: "module_not_available",
    });
    expect(loadImport).not.toHaveBeenCalled();
  });

  it("maps a flat workspace alias to an already preloaded canonical module", async () => {
    const canonical = { answer: 42 };
    const moduleMap = { "@workspace/runtime": canonical };
    const loadImport = vi.fn();

    const result = await executeSandbox(
      'import { answer } from "@workspace-runtime"; return answer;',
      {
        syntax: "typescript",
        imports: { "@workspace-runtime": "workspace-runtime" },
        moduleMap,
        loadImport,
        require: (id) => moduleMap[id as keyof typeof moduleMap],
      },
    );

    expect(result).toMatchObject({ success: true, returnValue: 42 });
    expect(moduleMap["@workspace-runtime" as keyof typeof moduleMap]).toBe(
      canonical,
    );
    expect(loadImport).not.toHaveBeenCalled();
  });
});
