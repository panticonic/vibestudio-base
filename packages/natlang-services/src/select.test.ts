import { describe, expect, it, vi } from "vitest";
import { systemTestRunnerRpcMethods } from "@vibestudio/service-schemas/systemTestRunner";
import { SERVICE_CATALOG, SERVICE_NAMES, selectServices, serviceDeclarations } from "./index.js";

/** A binding whose every listed method is a spy that resolves to its own name. */
function spyBinding(methods: readonly string[], extra: Record<string, unknown> = {}) {
  return Object.fromEntries([
    ...methods.map((method) => [method, vi.fn(async (..._args: unknown[]) => `${method}-result`)]),
    ...Object.entries(extra),
  ]);
}

function declared(name: string): string[] {
  return SERVICE_CATALOG.find((entry) => entry.name === name)!.methods.map((m) => m.name);
}

/** Bindings as an agent-owned eval has them, each with MORE than the service may use. */
function evalBindings() {
  const withExtras = (name: string) => spyBinding([...declared(name), "dangerousExtra"]);
  const rawServices = {
    serverLog: withExtras("serverLog"),
    docs: spyBinding([...declared("docs"), "listServices", "getSchema"]),
    fs: spyBinding([...declared("fs"), "writeFile", "unlink"]),
  };
  const rpc = { call: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ runId: "run-1" })) };
  const extensions = { invoke: vi.fn(async (..._args: unknown[]): Promise<unknown> => []) };
  return {
    services: rawServices,
    web: withExtras("web"),
    memory: withExtras("memory"),
    rpc,
    extensions,
  };
}

describe("selectServices", () => {
  it("refuses unknown service names instead of ignoring them", () => {
    expect(() => selectServices(evalBindings(), ["serverLog", "serverLogs", "shell"])).toThrow(
      /unknown natlang services "serverLogs", "shell"; available: serverLog, docs/
    );
    expect(() => selectServices(evalBindings(), ["toString"])).toThrow(/unknown natlang service "toString"/);
  });

  it("gives each service exactly the methods it declares, never the rest of the binding", () => {
    const selected = selectServices(evalBindings(), [...SERVICE_NAMES]);
    for (const entry of SERVICE_CATALOG) {
      expect(Object.keys(selected[entry.name]!).sort(), entry.name).toEqual(declared(entry.name).sort());
    }
    // The authority a program is NOT given is absent, not merely undocumented.
    expect(selected["docs"]).not.toHaveProperty("listServices");
    expect(selected["fs"]).not.toHaveProperty("writeFile");
    expect(Object.isFrozen(selected["fs"])).toBe(true);
  });

  it("forwards calls through the caller's own bindings and returns their results", async () => {
    const bindings = evalBindings();
    const selected = selectServices(bindings, ["serverLog", "docs", "fs", "web", "memory"]);
    await expect(
      (selected["serverLog"]!["query"] as (f: unknown) => Promise<unknown>)({ level: "warn" })
    ).resolves.toBe("query-result");
    expect(bindings.services.serverLog["query"]).toHaveBeenCalledWith({ level: "warn" });
    await expect(
      (selected["fs"]!["grep"] as (p: string, o: unknown) => Promise<unknown>)("TODO", { path: "/" })
    ).resolves.toBe("grep-result");
    expect(bindings.services.fs["grep"]).toHaveBeenCalledWith("TODO", { path: "/" });
    await (selected["docs"]!["search"] as (q: string, o: unknown) => Promise<unknown>)("blob digest", { limit: 5 });
    expect(bindings.services.docs["search"]).toHaveBeenCalledWith("blob digest", { limit: 5 });
    await (selected["web"]!["fetch"] as (i: unknown) => Promise<unknown>)({
      url: "https://example.com/",
      session: "browser",
    });
    expect(bindings.web["fetch"]).toHaveBeenCalledWith({
      url: "https://example.com/",
      session: "browser",
    });
    await (selected["memory"]!["recall"] as (i: unknown) => Promise<unknown>)({ query: "retry" });
    expect(bindings.memory["recall"]).toHaveBeenCalledWith({ query: "retry" });
  });

  it("propagates a denial or approval refusal from the binding unchanged", async () => {
    const bindings = evalBindings();
    const denial = new Error("approval denied: web page with imported browser cookies");
    (bindings.web["fetch"] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(denial);
    const { web } = selectServices(bindings, ["web"]);
    await expect(
      (web!["fetch"] as (i: unknown) => Promise<unknown>)({ url: "https://x.example/", session: "browser" })
    ).rejects.toBe(denial);
  });

  it("explains which eval binding a service needs when it is missing", () => {
    expect(() => selectServices({}, ["memory"])).toThrow(/needs the eval binding `memory`/);
    expect(() => selectServices({}, ["docs"])).toThrow(/natlang service "docs" needs the eval binding `services`/);
    expect(() => selectServices({ services: {} }, ["serverLog"])).toThrow(
      /needs `services.serverLog`, which is not an object/
    );
    expect(() => selectServices({ web: {} }, ["web"])).toThrow(/has no method search/);
  });

  it("lists local models through the extension and validates the wire result", async () => {
    const bindings = evalBindings();
    const { localModels } = selectServices(bindings, ["localModels"]);
    const list = localModels!["listModels"] as () => Promise<unknown>;
    await expect(list()).resolves.toEqual([]);
    expect(bindings.extensions.invoke).toHaveBeenCalledWith(
      "@workspace-extensions/local-models",
      "listModels",
      []
    );
    bindings.extensions.invoke.mockResolvedValueOnce([{ slug: "only-a-slug" }]);
    await expect(list()).rejects.toThrow();
  });

  it("inspects a system-test run through the runner's own read method", async () => {
    const bindings = evalBindings();
    const { systemTests } = selectServices(bindings, ["systemTests"]);
    const inspect = systemTests!["inspect"] as (...a: unknown[]) => Promise<unknown>;
    await expect(inspect("do:runner", "run-1", "some-test")).resolves.toEqual({ runId: "run-1" });
    expect(bindings.rpc.call).toHaveBeenCalledWith(
      "do:runner",
      systemTestRunnerRpcMethods.inspectSystemTestRun,
      ["run-1", "some-test"]
    );
    // The runner gates who may read a record; its refusal reaches the program.
    bindings.rpc.call.mockRejectedValueOnce(new Error("not a system-test operator"));
    await expect(inspect("do:runner", "run-2")).rejects.toThrow("not a system-test operator");
  });
});

describe("serviceDeclarations", () => {
  it("declares exactly the cataloged services and methods", () => {
    expect(Object.keys(serviceDeclarations).sort()).toEqual([...SERVICE_NAMES].sort());
    for (const entry of SERVICE_CATALOG) {
      const text = serviceDeclarations[entry.name]!;
      const functions = [...text.matchAll(/^export function (\w+)\(/gmu)].map((match) => match[1]);
      expect(functions.sort(), entry.name).toEqual(entry.methods.map((m) => m.name).sort());
    }
  });

  it("carries a doc comment on every declared method", () => {
    for (const [name, text] of Object.entries(serviceDeclarations)) {
      for (const match of text.matchAll(/^export function (\w+)\(/gmu)) {
        const before = text.slice(0, match.index).trimEnd();
        expect(before.endsWith("*/"), `${name}.${match[1]}`).toBe(true);
      }
    }
  });
});
