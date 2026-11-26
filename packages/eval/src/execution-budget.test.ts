import vm from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { tameRealmCodegen } from "@vibestudio/shared/evalConfinement";
import { executeSandbox } from "./sandbox.js";
const owned = () => {
  let clock = 0;
  const context = vm.createContext({});
  tameRealmCodegen(vm.runInContext("globalThis", context));
  return {
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    compile: (params: string[], body: string) =>
      vm.compileFunction(body, params, { parsingContext: context }),
  };
};
const base = {
  syntax: "javascript" as const,
  moduleMap: {},
  require: () => {
    throw Error("No modules assigned");
  },
  confinement: "private-global" as const,
};
afterEach(() => vi.restoreAllMocks());
it("starts the guest budget after actual explicit realm compilation and records distinct phases", async () => {
  const realm = owned();
  vi.spyOn(Date, "now").mockImplementation(realm.now);
  let first = true;
  const phases: string[] = [];
  const result = await executeSandbox("return 42", {
    ...base,
    executionTimeoutMs: 25,
    onPhase: (phase) => phases.push(phase),
    compileFunction: (params, body) => {
      if (first) {
        realm.advance(100);
        first = false;
      }
      return realm.compile(params, body);
    },
  });
  expect(result, JSON.stringify(result)).toMatchObject({
    success: true,
    returnValue: 42,
  });
  expect(phases[0]).toBe("prepare");
  expect(phases.indexOf("compile")).toBeLessThan(phases.indexOf("execute"));
  expect(phases.at(-1)).toBe("complete");
});
it.each([
  "for(let i=0;i<10;i++){tick();} return 1;",
  "function recurse(){tick();return recurse();}return recurse();",
])(
  "bounds real synchronous guest code independently of preparation: %s",
  async (code) => {
    const realm = owned();
    vi.spyOn(Date, "now").mockImplementation(realm.now);
    const cancelled = vi.fn();
    const result = await executeSandbox(code, {
      ...base,
      executionTimeoutMs: 25,
      compileFunction: realm.compile,
      bindings: { tick: () => realm.advance(10) },
      onExecutionTimeout: cancelled,
    });
    expect(result, JSON.stringify(result)).toMatchObject({
      success: false,
      failureKind: "cancelled",
      failureCode: "eval_execution_deadline_exceeded",
    });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(realm.now()).toBe(30);
  },
);
it("rejects a late native return even when the event-loop timer could not run", async () => {
  const realm = owned();
  vi.spyOn(Date, "now").mockImplementation(realm.now);
  const result = await executeSandbox("return nativeCall()", {
    ...base,
    executionTimeoutMs: 25,
    compileFunction: realm.compile,
    bindings: {
      nativeCall: () => {
        realm.advance(100);
        return "late";
      },
    },
  });
  expect(result, JSON.stringify(result)).toMatchObject({
    success: false,
    failureCode: "eval_execution_deadline_exceeded",
  });
});
it("aborts asynchronous guest settlement through the exact owner hook", async () => {
  const realm = owned(),
    cancelled = vi.fn();
  const result = await executeSandbox("return await pending()", {
    ...base,
    executionTimeoutMs: 20,
    compileFunction: realm.compile,
    bindings: { pending: () => new Promise(() => {}) },
    onExecutionTimeout: cancelled,
  });
  expect(result, JSON.stringify(result)).toMatchObject({
    success: false,
    failureKind: "cancelled",
    failureCode: "eval_execution_deadline_exceeded",
    error: { errorData: { phase: "await" } },
  });
  expect(cancelled).toHaveBeenCalledOnce();
});
it("preserves the earlier whole-run deadline and refuses guest effects after slow preparation", async () => {
  const realm = owned();
  vi.spyOn(Date, "now").mockImplementation(realm.now);
  const effect = vi.fn();
  let first = true;
  const result = await executeSandbox("effect();return 1", {
    ...base,
    deadline: { atMs: 25, timeoutMs: 25 },
    executionTimeoutMs: 1000,
    compileFunction: (params, body) => {
      if (first) {
        realm.advance(100);
        first = false;
      }
      return realm.compile(params, body);
    },
    bindings: { effect },
  });
  expect(result, JSON.stringify(result)).toMatchObject({
    success: false,
    error: { message: "eval timed out after 25ms" },
  });
  expect(effect).not.toHaveBeenCalled();
});
it("does not abort a completed owner after its guest timer expires", async () => {
  const realm = owned(),
    cancelled = vi.fn();
  expect(
    (
      await executeSandbox("return 1", {
        ...base,
        executionTimeoutMs: 20,
        compileFunction: realm.compile,
        onExecutionTimeout: cancelled,
      })
    ).success,
  ).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(cancelled).not.toHaveBeenCalled();
});
it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "refuses invalid guest budget %s before executing",
  async (executionTimeoutMs) => {
    const effect = vi.fn();
    const result = await executeSandbox("effect()", {
      ...base,
      executionTimeoutMs,
      bindings: { effect },
    });
    expect(result.success).toBe(false);
    expect(effect).not.toHaveBeenCalled();
  },
);

it("bounds imported package initializers before the entry can run", async () => {
  const realm = owned(),
    cancelled = vi.fn(),
    entry = vi.fn();
  const modules: Record<string, unknown> = {};
  const result = await executeSandbox(
    'import {value} from "@workspace/guest";entry();return value',
    {
      ...base,
      moduleMap: modules,
      require: (id) => {
        if (id in modules) return modules[id];
        throw Error(id);
      },
      imports: { "@workspace/guest": "latest" },
      loadImport: async () =>
        ({
          bundle: "while(true){} module.exports={value:42}",
          format: "cjs",
          requiredModules: [],
          sourceMap: null,
        }) as never,
      bindings: { entry, tick: () => realm.advance(10) },
      executionTimeoutMs: 25,
      compileFunction: realm.compile,
      onExecutionTimeout: cancelled,
    },
  );
  expect(result, JSON.stringify(result)).toMatchObject({
    success: false,
    failureCode: "eval_execution_deadline_exceeded",
  });
  expect(entry).not.toHaveBeenCalled();
  expect(cancelled).toHaveBeenCalledOnce();
});
it("bounds local source-file initializers with the same owner clock", async () => {
  const realm = owned(),
    cancelled = vi.fn();
  const result = await executeSandbox(
    'import {value} from "./guest.js";return value',
    {
      ...base,
      sourcePath: "/entry.ts",
      sourceFiles: {
        "/entry.ts": 'import {value} from "./guest.js";return value',
        "/guest.js": "while(true){} export const value=42;",
      },
      bindings: { tick: () => realm.advance(10) },
      executionTimeoutMs: 25,
      compileFunction: realm.compile,
      onExecutionTimeout: cancelled,
    },
  );
  expect(result, JSON.stringify(result)).toMatchObject({
    success: false,
    failureCode: "eval_execution_deadline_exceeded",
  });
  expect(cancelled).toHaveBeenCalledOnce();
});

it("fails closed on retained library functions carrying a different invocation's checkpoint owner",async()=>{
 const realm=owned(),modules:Record<string,unknown>={};
 const require=(id:string)=>{if(id in modules)return modules[id];throw Error(id);};
 const loadImport=async()=>({bundle:'module.exports={run:()=>42}',format:"cjs",requiredModules:[]} as never);
 const options={...base,moduleMap:modules,require,loadImport,compileFunction:realm.compile,executionTimeoutMs:100};
 expect(await executeSandbox('import {run} from "@workspace/guest";return run()',options)).toMatchObject({success:true,returnValue:42});
 expect(await executeSandbox('return require("@workspace/guest").run()',options)).toMatchObject({success:false,failureKind:"infrastructure",failureCode:"execution_budget_cached_module_unsupported"});
 // Whole-run-only callers retain their existing imported-module semantics.
 expect(await executeSandbox('return require("@workspace/guest").run()',{...options,executionTimeoutMs:undefined})).toMatchObject({success:true,returnValue:42});
});

it("does not lose a retained library guard owner when the host copies its registry between cells",async()=>{
 const realm=owned(),modules:Record<string,unknown>={};
 const requireFor=(map:Record<string,unknown>)=>(id:string)=>{if(id in map)return map[id];throw Error(id);};
 const loadImport=async()=>({bundle:'module.exports={run:()=>42}',format:"cjs",requiredModules:[]} as never);
 const options={...base,moduleMap:modules,require:requireFor(modules),loadImport,compileFunction:realm.compile,executionTimeoutMs:100};
 expect(await executeSandbox('import {run} from "@workspace/guest";return run()',options)).toMatchObject({success:true,returnValue:42});
 const next={...modules};
 expect(await executeSandbox('return require("@workspace/guest").run()',{...options,moduleMap:next,require:requireFor(next)})).toMatchObject({success:false,failureKind:"infrastructure",failureCode:"execution_budget_cached_module_unsupported"});
});
