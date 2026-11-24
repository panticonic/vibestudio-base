import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createNatlangRuntime, workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import {
  NatlangProgramError,
  ProgramLoader,
  bindProgram,
  compileProgram,
  programProductInput,
  readProjectFiles,
  workspacePath,
  type WorkspaceFs,
} from "./programs.js";
import { declaredServiceNames } from "./services.js";
import { testNewFunction } from "./testSupport.js";

const BRIEF = `---
description: Summarize a log.
args:
  text: string
returns: string
---
Summarize text in one sentence.
`;

const SERVICES_DTS = `declare module 'natlang:services' {
  export const serverLog: { readLog(): Promise<unknown> };
  export const gad: unknown;
}
`;

/** An in-memory `fs` over a flat map of workspace paths. */
function memoryFs(files: Record<string, string>): WorkspaceFs & { reads: string[] } {
  const reads: string[] = [];
  const directories = (prefix: string) => {
    const children = new Map<string, boolean>();
    for (const path of Object.keys(files)) {
      if (!path.startsWith(`${prefix}/`)) continue;
      const [first, ...rest] = path.slice(prefix.length + 1).split("/");
      children.set(first!, rest.length > 0);
    }
    return children;
  };
  return {
    reads,
    async readFile(path) {
      reads.push(path);
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    async readdir(path) {
      const children = directories(path);
      if (children.size === 0) throw new Error(`ENOENT ${path}`);
      return [...children].map(([name, isDirectory]) => ({ name, isDirectory: () => isDirectory }));
    },
    async stat(path) {
      return { isDirectory: () => directories(path).size > 0 };
    },
  };
}

const platform = () => workerdPlatform({ realm: confinedRealm(testNewFunction()) });

// Compile the full joint program within a test-specific budget. The virtual
// project includes the complete callable graph and took over 30s cold on Tick.
const OPEN_GOAL_COMPILE_TEST_MS = 90_000;

describe("workspacePath", () => {
  it("maps import-style specifiers to workspace paths", () => {
    expect(workspacePath("@workspace-skills/server-logs/brief.nl")).toBe("skills/server-logs/brief.nl");
    expect(workspacePath("/skills/x/")).toBe("skills/x");
    expect(workspacePath("packages/p/a.nl")).toBe("packages/p/a.nl");
  });
});

describe("declaredServiceNames", () => {
  it("reads a program's declare module blocks and natlang:services imports", () => {
    expect(
      declaredServiceNames({
        "services.d.ts": SERVICES_DTS,
        "helper.ts": "import { fs, type vcs, web as w } from 'natlang:services';\nexport const x = 1;",
        "other.d.ts": "declare module 'other' { export const nope: number; }",
        "note.md": "import { credentials } from 'natlang:services'",
      })
    ).toEqual(["fs", "gad", "serverLog", "vcs", "web"]);
  });

  it("declares nothing for a program that names no service", () => {
    expect(declaredServiceNames({ "brief.nl": BRIEF })).toEqual([]);
  });
});

describe("readProjectFiles", () => {
  it("reads program files below a folder and skips dot files, node_modules and other files", async () => {
    const fs = memoryFs({
      "skills/s/brief.nl": BRIEF,
      "skills/s/brief/helper.ts": "export default 1;",
      "skills/s/.hidden/x.ts": "x",
      "skills/s/node_modules/p/index.js": "x",
      "skills/s/logo.png": "binary",
    });
    expect(Object.keys(await readProjectFiles(fs, "skills/s"))).toEqual(["brief.nl", "brief/helper.ts"]);
  });
});

describe("compileProgram", () => {
  it("loads a .nl function and reports the services it declares", () => {
    const program = compileProgram({
      platform: platform(),
      files: { "brief.nl": BRIEF, "services.d.ts": SERVICES_DTS },
      entry: "brief.nl",
      label: "skills/s/brief.nl",
    });
    expect(program.services).toEqual(["gad", "serverLog"]);
    expect(typeof program.value).toBe("function");
  });

  it("validates authored file and folder entries with the same declarations", () => {
    const files = { "brief.nl": BRIEF };
    const single = compileProgram({ platform: platform(), files, entry: "brief.nl", label: "skills/s/brief.nl" });
    const folder = compileProgram({ platform: platform(), files, entry: "", label: "skills/s" });
    expect(typeof (folder.value as { brief: unknown }).brief).toBe("function");
    expect(folder.declarations).toEqual(single.declarations);
    expect(folder.declarations["brief.d.nl.ts"]).toContain("NatlangFunction<[text: string], string>");

    const stale = {
      ...files,
      "broken.ts": "export { default as missing } from './missing.nl';",
      "missing.d.nl.ts": "declare const missing: string; export default missing;",
    };
    for (const entry of ["", "brief.nl"]) {
      expect(() => compileProgram({ platform: platform(), files: stale, entry, label: "skills/s" })).toThrow(
        /cannot import \.\/missing\.nl: no such natlang function/
      );
    }
  });

  it("runs emitted TypeScript entry modules including their named Natlang imports", () => {
    const program = compileProgram({
      platform: platform(),
      files: {
        "brief.nl": BRIEF,
        "entry.ts": "export { default as brief } from './brief.nl';\nexport const version = 2;",
      },
      entry: "entry.ts",
      label: "skills/s/entry.ts",
    });
    expect(program.value).toEqual({ brief: expect.any(Function), version: 2 });
  });

  it("refuses a program that does not type-check, naming it", () => {
    const files = { "main.ts": "export const x: number = 'not a number';\n" };
    expect(() => compileProgram({ platform: platform(), files, entry: "main.ts", label: "skills/bad" })).toThrow(
      NatlangProgramError
    );
    expect(() => compileProgram({ platform: platform(), files, entry: "main.ts", label: "skills/bad" })).toThrow(
      /skills\/bad does not compile/
    );
  });
});

describe("ProgramLoader", () => {
  const load = async (files: Record<string, string>, bindings: Record<string, unknown>, path: string) => {
    const tasks: Array<{ services: Record<string, object>; serviceDeclarations: Record<string, string> }> = [];
    const loader = new ProgramLoader({
      platform: platform(),
      fs: memoryFs(files),
      bindings,
      runTask: async (run, task) => {
        tasks.push(task);
        return run();
      },
    });
    return { loader, tasks, value: await loader.load(path) };
  };

  it("binds a program to exactly its declared services, never the eval's other bindings", async () => {
    const { tasks, value } = await load(
      { "skills/s/brief.nl": BRIEF, "skills/s/services.d.ts": "declare module 'natlang:services' { export const web: unknown; }" },
      {
        web: { search: async () => [], fetch: async () => "", read: async () => "" },
        agent: { addressees: async () => [] },
        credentials: { fetch: async () => "secret" },
        vcs: {},
      },
      "skills/s/brief.nl"
    );
    // Invoking the program starts a task; the task's services are the declared slice.
    await expect((value as () => Promise<unknown>)()).rejects.toThrow();
    expect(tasks).toHaveLength(1);
    expect(Object.keys(tasks[0]!.services)).toEqual(["web"]);
    expect(Object.keys(tasks[0]!.serviceDeclarations)).toEqual(["web"]);
  });

  it("refuses a service the catalog does not have", async () => {
    await expect(
      load(
        { "skills/s/brief.nl": BRIEF, "skills/s/services.d.ts": "declare module 'natlang:services' { export const teleport: unknown; }" },
        {},
        "skills/s/brief.nl"
      )
    ).rejects.toThrow(/skills\/s\/brief\.nl cannot get its services: unknown natlang service "teleport"/);
  });

  it("refuses a declared service the eval has no binding for", async () => {
    await expect(
      load(
        { "skills/s/brief.nl": BRIEF, "skills/s/services.d.ts": "declare module 'natlang:services' { export const web: unknown; }" },
        {},
        "skills/s/brief.nl"
      )
    ).rejects.toThrow(/needs the eval binding `web`/);
  });

  it("re-checks a program when its content changes, and loads reverted content again", async () => {
    const files: Record<string, string> = { "skills/s/main.ts": "export const x: number = 1;\n" };
    const loader = new ProgramLoader({
      platform: platform(),
      fs: memoryFs(files),
      bindings: {},
      runTask: (run) => run(),
    });
    expect((await loader.load("skills/s/main.ts") as { x: number }).x).toBe(1);
    files["skills/s/main.ts"] = "export const x: number = 'two';\n";
    await expect(loader.load("skills/s/main.ts")).rejects.toThrow(NatlangProgramError);
    files["skills/s/main.ts"] = "export const x: number = 1;\n";
    expect((await loader.load("skills/s/main.ts") as { x: number }).x).toBe(1);
  });

  it("loads a folder as a record of callables", async () => {
    const { value } = await load({ "skills/s/brief.nl": BRIEF, "skills/s/other.nl": BRIEF.replace("Summarize", "Condense") }, {}, "skills/s");
    expect(Object.keys(value as object).sort()).toEqual(["brief", "other"]);
  });

  it("returns positioned source-policy rejections through both public inspection paths", async () => {
    const loader = new ProgramLoader({
      platform: platform(),
      fs: memoryFs({
        "skills/s/brief.nl": BRIEF,
        "skills/s/step.ts": "export function step(): void { while (true) break; }\n",
      }),
      bindings: {},
      runTask: (run) => run(),
    });
    for (const attempt of [() => loader.describe("skills/s"), () => loader.load("skills/s")]) {
      await expect(attempt()).rejects.toMatchObject({
        name: "NatlangProgramError",
        message: expect.stringMatching(/skills\/s\/step\.ts:1:\d+ error source: .*loops are not allowed/u),
        errorData: { reason: "does-not-compile", program: "skills/s" },
      });
    }
  });

  it("describes a program's functions with typed, expanded signatures and field docs", async () => {
    const files: Record<string, string> = {
      "skills/s/types.ts": "export type Ticket = {\n  /** What the customer wrote. */\n  text: string;\n  tags?: string[];\n};\nexport type Verdict = 'urgent' | 'normal';\n",
      "skills/s/triage.nl": "---\ndescription: Decide whether a ticket is urgent.\nargs:\n  ticket: Ticket\n  limit?: number\nreturns: Verdict\n---\nDecide whether ticket is urgent.\n",
      "skills/s/triage/helper.nl": BRIEF,
      "skills/s/services.d.ts": SERVICES_DTS,
    };
    const loader = new ProgramLoader({ platform: platform(), fs: memoryFs(files), bindings: {}, runTask: (run) => run() });
    const description = await loader.describe("skills/s");
    expect(description.root).toBe("skills/s");
    expect(description.services).toEqual(["gad", "serverLog"]);
    const triage = description.functions.find((fn) => fn.name === "triage")!;
    expect(triage).toMatchObject({
      source: "triage.nl",
      description: "Decide whether a ticket is urgent.",
      params: ["ticket: Ticket", "limit?: number"],
      returns: "Verdict",
    });
    expect(triage.fields.map((field) => [field.name, field.required])).toEqual([["ticket", true], ["limit", false]]);
    expect(triage.fields[0]!.tree).toMatchObject({
      kind: "record",
      alias: "Ticket",
      fields: [
        { name: "text", doc: "What the customer wrote.", type: { kind: "prim", name: "string" } },
        { name: "tags", optional: true, type: { kind: "list" } },
      ],
    });
    expect(triage.result.tree).toMatchObject({ kind: "union", alias: "Verdict" });
    expect(description.functions.map((fn) => fn.source)).toContain("triage/helper.nl");
    // A single file describes the file's folder as its root.
    expect((await loader.describe("skills/s/triage.nl")).root).toBe("skills/s");
  });

  it("resolves repeated signature text separately in mounted lexical scopes", async () => {
    const nested = BRIEF.replace("returns: string", "returns: Reply");
    const loader = new ProgramLoader({
      platform: platform(),
      fs: memoryFs({
        "skills/root/brief.nl": BRIEF,
        "skills/root/natlang.json": '{"workspaceModules":{"brief/first":"skills/first","brief/second":"skills/second"}}',
        "skills/first/read.nl": nested,
        "skills/first/types.ts": "export type Reply = { value: string };",
        "skills/second/read.nl": nested,
        "skills/second/types.ts": "export type Reply = { value: number };",
      }),
      bindings: {},
      runTask: run => run(),
    });
    const { functions } = await loader.describe("skills/root/brief.nl");
    const resultFor = (source: string) => functions.find(fn => fn.source === source)?.result.tree;
    expect(resultFor("brief/first/read.nl")).toMatchObject({ fields: [{ name: "value", type: { name: "string" } }] });
    expect(resultFor("brief/second/read.nl")).toMatchObject({ fields: [{ name: "value", type: { name: "number" } }] });
  });

  it("describes nothing for a program that does not compile, with its diagnostics", async () => {
    const loader = new ProgramLoader({
      platform: platform(),
      fs: memoryFs({ "skills/bad/main.ts": "export const x: number = 'no';\n" }),
      bindings: {},
      runTask: (run) => run(),
    });
    await expect(loader.describe("skills/bad")).rejects.toThrow(/skills\/bad does not compile/);
  });

  it("rejects a path that is not a program", async () => {
    await expect(load({ "skills/s/notes.md": "x" }, {}, "skills/s/notes.md")).rejects.toThrow(/takes a \.nl file/);
  });
});

describe("bindProgram", () => {
  it("wraps every callable of a record, keeps the rest, and starts a task per call", async () => {
    const ran: string[] = [];
    const bound = bindProgram(
      { go: Object.assign(async (value: number) => value * 2, { inner: async () => "deep" }), label: "text" },
      { services: {}, serviceDeclarations: {} },
      async (run) => {
        ran.push("task");
        return run();
      }
    ) as { go: ((n: number) => Promise<number>) & { inner(): Promise<string> }; label: string };
    expect(bound.label).toBe("text");
    expect(await bound.go(4)).toBe(8);
    expect(await bound.go.inner()).toBe("deep");
    expect(ran).toEqual(["task", "task"]);
  });
});

it("keeps explicit declared service adapters isolated across cached program loads", async () => {
  const tasks: Array<{ services: Record<string, object> }> = [];
  const loader = new ProgramLoader({
    platform: platform(),
    fs: memoryFs({
      "skills/s/brief.nl": BRIEF,
      "skills/s/services.d.ts": "declare module 'natlang:services' { export const web: unknown; }",
    }),
    bindings: {},
    runTask: async (_run, task) => {
      tasks.push(task);
      throw new Error("bound task observed");
    },
  });
  const adapter = (id: string) => ({ search: async () => id, fetch: async () => id, read: async () => id });
  const first = (await loader.load("skills/s/brief.nl", { services: { web: adapter("first") } })) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  const second = (await loader.load("skills/s/brief.nl", { services: { web: adapter("second") } })) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  await expect(first("q")).rejects.toThrow("bound task observed");
  await expect(second("q")).rejects.toThrow("bound task observed");
  expect(await (tasks[0]!.services["web"] as { search(): Promise<string> }).search()).toBe("first");
  expect(await (tasks[1]!.services["web"] as { search(): Promise<string> }).search()).toBe("second");
  await expect(loader.load("skills/s/brief.nl", { services: { fs: {} } })).rejects.toThrow(
    "does not declare service fs",
  );
});

it("limits an authored editing service to the exact root of a loaded program", async () => {
  const deployed = platform();
  const visible: Record<string, string[]> = {};
  const edits: string[] = [];
  const runtime = createNatlangRuntime({
    platform: deployed,
    agent: async (session) => {
      const name = session.lam.functionName;
      visible[name] = Object.keys(session.availableServices());
      const result = await session.applyAsync("eval", {
        code: name === "brief"
          ? "await panelRepairEdit.apply('observed', []); return await inspectStage(text);"
          : "return text;",
        finish: true,
      });
      if (result.kind === "rejected") throw new Error(result.text);
    },
  });
  const loader = new ProgramLoader({
    platform: deployed,
    fs: memoryFs({
      "skills/s/brief.nl": BRIEF,
      "skills/s/brief/inspectStage.nl": BRIEF,
      "skills/s/services.d.ts": "declare module 'natlang:services' { export const panelRepairEdit: unknown; }",
      "skills/s/natlang.json": '{"serviceScopes":{"panelRepairEdit":["brief.nl"]}}',
    }),
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  const run = await loader.load("skills/s/brief.nl", {
    services: {
      panelRepairEdit: {
        apply: async (basis: string) => { edits.push(basis); return { revision: "new" }; },
        build: async () => ({}),
        rebuild: async () => ({}),
      },
    },
  }) as (text: string) => Promise<string>;
  await expect(run("actual input")).resolves.toBe("actual input");
  expect(edits).toEqual(["observed"]);
  expect(visible["brief"]).toContain("panelRepairEdit");
  expect(visible["inspectStage"]).not.toContain("panelRepairEdit");
});

it("compiles the installed program from two reads of the same workspace snapshot", async () => {
  const files = {
    "skills/root/brief.nl": BRIEF,
    "skills/root/natlang.json": JSON.stringify({
      workspaceModules: { "brief/first": "skills/mounted", "brief/absent": "skills/absent" },
    }),
    "skills/mounted/read.nl": BRIEF,
  };
  const fs = memoryFs(files);
  const requests: Array<{ roots: string[]; expectedSnapshot?: string }> = [];
  let snapshot = "working-head";
  fs.readProgramSources = async input => {
    requests.push(input);
    const sources = Object.entries(files)
      .filter(([path]) => input.roots.some(root => path.startsWith(`${root}/`)))
      .map(([path, content]) => ({ path, content }));
    return {
      snapshot: input.expectedSnapshot ? snapshot : "working-head",
      directories: input.roots.filter(root => sources.some(({ path }) => path.startsWith(`${root}/`))),
      files: sources.reverse(),
    };
  };
  const getLoader = (workspaceFs: WorkspaceFs) => new ProgramLoader({
    platform: platform(), fs: workspaceFs, bindings: {}, runTask: run => run(),
  });
  const direct = await getLoader(memoryFs(files)).describe("skills/root/brief.nl");
  const loader = getLoader(fs);
  expect(await loader.describe("skills/root/brief.nl")).toEqual(direct);
  expect(requests).toEqual([
    { roots: ["skills/root"] },
    { roots: ["skills/mounted", "skills/absent"], expectedSnapshot: "working-head" },
  ]);
  expect(fs.reads).toEqual([]);
  snapshot = "new-revision";
  await expect(loader.describe("skills/root/brief.nl")).rejects.toThrow("changed while resolving installed mounts");
});

it("bounds semantic source reads across mounted trees and concurrent loads", async () => {
  const mounts = {
    "brief/first": "skills/first",
    "brief/second": "skills/second",
    "brief/again": "skills/first",
  };
  const files = {
    "skills/root/brief.nl": BRIEF,
    "skills/root/natlang.json": JSON.stringify({ workspaceModules: mounts }),
    "skills/first/readFirst.nl": BRIEF,
    "skills/second/readSecond.nl": BRIEF,
  } as Record<string, string>;
  for (const source of new Set(Object.values(mounts))) {
    for (let index = 0; index < 24; index++) {
      files[`${source}/docs/page${index}/README.md`] = "Workspace skill notes.";
    }
  }
  const storage = memoryFs(files);
  let active = 0;
  let peak = 0;
  const observe = async <T>(read: () => Promise<T>): Promise<T> => {
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return await read();
    } finally {
      active--;
    }
  };
  const loader = new ProgramLoader({
    platform: platform(),
    fs: {
      readFile: (...args) => observe(() => storage.readFile(...args)),
      readdir: (...args) => observe(() => storage.readdir(...args)),
      stat: (...args) => observe(() => storage.stat(...args)),
    },
    bindings: {},
    runTask: (run) => run(),
  });
  const descriptions = await Promise.all([
    loader.describe("skills/root/brief.nl"),
    loader.describe("skills/root/brief.nl"),
  ]);
  expect(peak).toBe(8);
  expect(active).toBe(0);
  expect(descriptions[0]?.functions.map(({ source }) => source)).toEqual(expect.arrayContaining([
    "brief/first/readFirst.nl", "brief/second/readSecond.nl", "brief/again/readFirst.nl",
  ]));
  expect(descriptions[1]).toEqual(descriptions[0]);
  expect(storage.reads.filter((file) => file === "skills/first/readFirst.nl")).toHaveLength(2);
});

it("links installed workspace modules as typed callable subtrees in the same task", async () => {
  const deployed = platform();
  const seen: Record<string, string[]> = {};
  const commands: Record<string, string> = {
    brief: "return await domains.support.inspect(text);",
    inspect: "await panelRepairEdit.apply(text, []); return await summarize(text);",
    summarize: "return text + ' read';",
  };
  const runtime = createNatlangRuntime({
    platform: deployed,
    agent: async (session) => {
      const name = session.lam.functionName!;
      seen[name] = Object.keys(session.availableServices());
      const result = await session.applyAsync("eval", { code: commands[name]!, finish: true });
      if (result.kind === "rejected") throw new Error(result.text);
    },
  });
  const fs = memoryFs({
    "skills/hub/brief.nl": BRIEF,
    "skills/hub/natlang.json": JSON.stringify({
      serviceBinding: "explicit",
      workspaceModules: {
        "brief/domains/support": "skills/support-program",
        "brief/domains/absent": "skills/uninstalled",
      },
    }),
    "skills/support-program/natlang.json": JSON.stringify({
      serviceScopes: { panelRepairEdit: ["inspect.nl"] },
    }),
    "skills/support-program/inspect.nl": BRIEF.replace("returns: string", "returns: string\nuses: [helpers/summarize]"),
    "skills/support-program/helpers/summarize.nl": BRIEF,
    "skills/support-program/services.d.ts": "declare module 'natlang:services' { export const panelRepairEdit: unknown; }",
  });
  const loader = new ProgramLoader({
    platform: deployed, fs, bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  const described = await loader.describe("skills/support-program");
  expect(described.serviceScopes).toEqual({ panelRepairEdit: ["inspect.nl"] });
  const edits: string[] = [];
  const run = await loader.load("skills/hub/brief.nl", { services: {
    panelRepairEdit: {
      apply: async (basis: string) => { edits.push(basis); return { revision: "verified" }; },
      build: async () => ({}),
      rebuild: async () => ({}),
    },
  } }) as (value: string) => Promise<string>;
  await expect(run("actual")).resolves.toBe("actual read");
  expect(edits).toEqual(["actual"]);
  expect(seen).toEqual({ brief: [], inspect: ["panelRepairEdit"], summarize: [] });
  expect(fs.reads).not.toContain("skills/uninstalled/natlang.json");
});

it("links a typed callable branch only when every installed module is present", async () => {
  const configuration = JSON.stringify({
    workspaceModules: { "brief/release/input": "skills/release-input", "brief/release/reviewer": "skills/reviewer" },
    workspaceBranches: { "brief/release": { mounts: ["brief/release/input", "brief/release/reviewer"], types: ["ReleaseReport"] } },
    serviceScopes: { panelRepairEdit: ["brief/release/stage.nl"] },
  });
  const files = {
    "skills/hub/natlang.json": configuration,
    "skills/hub/brief.nl": BRIEF,
    "skills/hub/brief/release.nl": BRIEF.replace("returns: string", "returns: ReleaseReport"),
    "skills/hub/brief/release/types.ts": 'export type { ReleaseReport } from "./input/types.js";',
    "skills/hub/brief/release/stage.nl": BRIEF,
    "skills/hub/services.d.ts": "declare module 'natlang:services' { export const panelRepairEdit: unknown; }",
    "skills/release-input/types.ts": 'export type ReleaseReport = { version: string };',
    "skills/release-input/read.nl": BRIEF,
  };
  const describe = (present: boolean) => new ProgramLoader({
    platform: platform(), bindings: {}, runTask: run => run(),
    fs: memoryFs({ ...files, ...(present ? { "skills/reviewer/check.nl": BRIEF } : {}) }),
  }).describe("skills/hub/brief.nl");
  const missing = await describe(false);
  expect(missing.functions.map(fn => fn.source)).toEqual(["brief.nl"]);
  expect(missing.serviceScopes.panelRepairEdit).toEqual([]);
  const ready = await describe(true);
  expect(ready.functions.map(fn => fn.source)).toEqual(expect.arrayContaining([
    "brief/release.nl", "brief/release/input/read.nl", "brief/release/reviewer/check.nl", "brief/release/stage.nl",
  ]));
  expect(ready.serviceScopes.panelRepairEdit).toEqual(["brief/release/stage.nl"]);
});

it("loads a public typed branch and mounted TS effects without a generic parent lambda", async () => {
  const files = {
    "skills/library/natlang.json": JSON.stringify({
      workspaceModules: { "release/input": "skills/release-input" },
      workspaceBranches: { release: { mounts: ["release/input"], types: ["ReleaseReport"] } },
    }),
    "skills/library/release.nl": BRIEF.replace("returns: string", "returns: ReleaseReport"),
    "skills/library/release/types.ts": 'export type { ReleaseReport } from "./input/types.js";',
    "skills/release-input/types.ts": 'export type ReleaseReport = { version: string };',
    "skills/release-input/read.nl": BRIEF,
    "skills/release-input/readEffect.ts": 'import { panelRepairEdit } from "natlang:services"; export default async function readEffect(): Promise<string> { return String(!!panelRepairEdit); }',
    "skills/release-input/services.d.ts": "declare module 'natlang:services' { export const panelRepairEdit: unknown; }",
    "skills/release-input/natlang.json": JSON.stringify({ serviceScopes: { panelRepairEdit: ["read.nl"] } }),
  };
  const loader = new ProgramLoader({ platform: platform(), bindings: {}, runTask: run => run(), fs: memoryFs(files) });
  const result = await loader.describe("skills/library/release.nl");
  expect(result.functions.map(fn => fn.source)).toContain("release.nl");
  expect(result.functions.find(fn => fn.source === "release.nl")?.returns).toBe("ReleaseReport");
  expect(result.serviceScopes.panelRepairEdit).toEqual(["release/input/read.nl"]);
});

it("refuses a mounted package with an unscoped service or overlapping ownership", async () => {
  const fs = memoryFs({
    "skills/hub/brief.nl": BRIEF,
    "skills/hub/natlang.json": '{"workspaceModules":{"brief/domains/support":"skills/support"}}',
    "skills/support/inspect.nl": BRIEF,
    "skills/support/services.d.ts": "declare module 'natlang:services' { export const panelRepairEdit: unknown; }",
  });
  const loader = new ProgramLoader({
    platform: platform(), fs, bindings: {}, runTask: (run) => run(),
  });
  await expect(loader.describe("skills/hub/brief.nl")).rejects.toThrow("Scope service panelRepairEdit");
});

it("compiles the semantic function library with its installed research skill and scoped services", async () => {
  const root = new URL("../../../", import.meta.url);
  const fs: WorkspaceFs = {
    async readdir(path) {
      return readdir(new URL(path + "/", root), { withFileTypes: true });
    },
    async readFile(path) {
      return readFile(new URL(path, root), "utf8");
    },
    async stat(path) {
      return { isDirectory: () => !/\.[a-z]+$/u.test(path) };
    },
  };
  const loader = new ProgramLoader({
    platform: platform(), fs, bindings: {}, runTask: (run) => run(),
  });
  const result = await loader.describe("skills/open-user-goal");
  expect(result.serviceScopes).toMatchObject({
    panelRecovery: ["visualRecovery/recoverPanelGoal.nl", "visualRecovery/recoverPanelGoal/recoverSurface.nl"],
    panelHealth: ["visualRecovery/reviewPanelHealth.nl", "visualRecovery/reviewPanelHealth/checkHealthChange.nl"],
    goalBrowser: ["workInBrowser.nl"],
    goalDiscovery: ["investigatePublicQuestion.nl"],
    goalWorkspace: ["reviseWorkspaceDocument.nl", "answerWorkspaceQuestion.nl"],
    goalSuite: ["verifyWorkspaceSuite.nl"],
    recoverySessions: ["recovery/recoverSessionGoal.nl"],
    recoveryReplay: ["recovery/recoverSessionGoal/readRecoveryWindows.nl"],
    recoveryHandoff: ["recovery/recoverSessionGoal/stageRecoveryHandoff.nl"],
    testSuitePlanRead: ["reviewInstalledPackage/reviewVerification/nativeSuite/reviewTestSuite.nl", "verifyWorkspaceSuite/suites/reviewTestSuite.nl"],
    testSuiteVerificationRun: ["reviewInstalledPackage/reviewVerification/nativeSuite/reviewTestSuite.nl", "verifyWorkspaceSuite/suites/reviewTestSuite.nl"],
    pdfVaultBridge: ["authorizePdfVaultHandoff.nl"],
    pdfGoalDocuments: ["workOnEditorialPacket/reviewPacketSource/pdf/workOnPdfGoal.nl", "pdf/workOnPdfGoal.nl"],
    pdfGoalVisual: ["workOnEditorialPacket/reviewPacketSource/pdf/workOnPdfGoal/readRenderedPages.nl", "pdf/workOnPdfGoal/readRenderedPages.nl"],
    // Exact native passthroughs run through typed TS/service bindings; they grant no model-facing NL authority.
    pdfIntakeProbe: [],
    pdfIntakeRead: [],
    pdfLayoutRead: ["workOnEditorialPacket/reviewPacketSource/pdf/reviewPdfLayout.nl", "pdf/reviewPdfLayout.nl"],
    ownedPreviewPublication: ["publication/publishOwnedPreviewGoal.nl", "publication/publishOwnedPreviewGoal/deliverPreview.nl"],
    publicationGoal: ["publication/workTowardPublicationGoal.nl"],
    publicationRevision: ["publication/reviewPublicationRevision.nl"],
    websiteReadback: ["publication/preflightPublication.nl"],
    web: [
      "answerFromAssignedPublicSources/webResearch/researchBrief.nl/**",
      "investigatePublicQuestion/sources/researchBrief.nl/**",
    ],
  });
  expect(result.functions.some(fn => fn.source === "publication/workTowardPublicationGoal.nl")).toBe(true);
  expect(result.functions.some(fn => fn.source === "pdf/workOnPdfGoal.nl")).toBe(true);
}, OPEN_GOAL_COMPILE_TEST_MS);

const installedOpenGoalSkills = [
  ["news", "news-workflows", "newsGoal", "news", "reviewUserNewsGoal"],
  ["spectrolite", "spectrolite-review", "spectroliteGoal", "spectrolite", "workTowardVaultGoal"],
  ["google-workspace", "google-drive", "googleGoalDiscovery", "google", "workOnDriveGoal"],
  ["google-workspace", "open-gmail-goal", "gmailGoalCatalog", "gmail", "recoverGmailGoal"],
  ["google-workspace", "open-google-handoff-goal", "googleHandoffMail", "googleHandoff", "reconcileGoogleHandoff", "reconcileGoogleHandoff/resolveMailDecision/readMailThreads"],
  ["personal", "open-personal-goal", "missionGoalBoard", "personal", "workOnMissionGoal"],
  ["personal", "open-personal-artifacts", "artifactLibrary", "personalArtifacts", "workOnPersonalArtifactsGoal", "workOnPersonalArtifactsGoal/maintainLibrary"],
  ["personal", "open-personal-history", "archiveTimeline", "personalHistory", "reviewPersonalHistory"],
  ["personal", "open-personal-automation", "operatorQueue", "personalAutomation", "coordinatePersonalAutomation"],
  ["google-workspace", "open-calendar-goal", "calendarGoalCatalog", "calendar", "workOnCalendarGoal"],
  ["system", "open-system-operations", "operatorDiscovery", "operator", "workOnSystemGoal"],
] as const;

it("mounts installed open-goal skills with their own service scopes", async () => {
  const base = new URL("../../../", import.meta.url);
  const installed = new Map(
    installedOpenGoalSkills.map(([template, skill]) => [`skills/${skill}`, JSON.parse(process.env.VIBESTUDIO_SEMANTIC_TEMPLATE_OVERRIDES ?? "{}")[template]
      ? pathToFileURL(`${JSON.parse(process.env.VIBESTUDIO_SEMANTIC_TEMPLATE_OVERRIDES ?? "{}")[template]}/`)
      : process.env.VIBESTUDIO_TEMPLATE_CHECKOUTS
        ? pathToFileURL(`${process.env.VIBESTUDIO_TEMPLATE_CHECKOUTS}/${template}/`)
        : new URL(`../${template}/`, base)])
  );
  const source = (path: string) => {
    const skill = [...installed.keys()].find(key => path === key || path.startsWith(key + "/"));
    return new URL(path, skill ? installed.get(skill)! : base);
  };
  const fs: WorkspaceFs = {
    async readdir(path) {
      const entries = await readdir(source(path + "/"), { withFileTypes: true });
      if (path !== "skills") return entries;
      const roots = new Set([...installed.values()].map(url => url.href));
      const extras = await Promise.all([...roots].map(async root => {
        const files = await readdir(new URL("skills/", root), { withFileTypes: true });
        return files.filter(entry => installed.get(`skills/${entry.name}`)?.href === root);
      }));
      return [...entries, ...extras.flat()];
    },
    readFile: path => readFile(source(path), "utf8"),
    async stat(path) { return { isDirectory: () => !/\.[a-z]+$/u.test(path) }; },
  };
  const loader = new ProgramLoader({ platform: platform(), fs, bindings: {}, runTask: run => run() });
  const program = await loader.describe("skills/open-user-goal");
  const functions = program.functions.map(fn => fn.source);
  const manifest = JSON.parse(await fs.readFile("skills/open-user-goal/natlang.json", "utf8")) as {
    workspaceModules: Record<string, string>;
  };
  for (const [template, skill, service, namespace, callable, owner = callable] of installedOpenGoalSkills) {
    const skillPath = `skills/${skill}`;
    const mounts = Object.entries(manifest.workspaceModules)
      .filter(([, sourcePath]) => sourcePath === skillPath || sourcePath.startsWith(`${skillPath}/`))
      .map(([mount]) => mount);
    const scopes = program.serviceScopes[service] ?? [];
    expect(functions).toContain(`${namespace}/${callable}.nl`);
    expect(scopes).toContain(`${namespace}/${owner}.nl`);
    if (template === "news") {
      const selectors = ["reviewUserNewsGoal.nl", "reviewUserNewsGoal/reconcileNewsGoal/reconcileNewsLane.nl"];
      expect([...scopes].sort()).toEqual(mounts.flatMap(mount => selectors.map(selector => `${mount}/${selector}`)).sort());
    } else {
      expect(scopes.every(scope => mounts.some(mount => scope.startsWith(`${mount}/`))), service).toBe(true);
    }
  }
}, OPEN_GOAL_COMPILE_TEST_MS);

it("offloaded pure frontend products preserve each ProgramLoader's runtime module state",async()=>{
  const {compileVirtualProjectProduct}=await import("../vendor/workerd/natlang-workerd.js");
  let compilerCalls=0;
  const fs=memoryFs({"skills/native/main.ts":"let n=0; export function next():number{return ++n;}"});
  const products=new Map<string,unknown>();
  const compileProduct=async(input:any)=>{
    const key=JSON.stringify(input);if(!products.has(key)){compilerCalls++;products.set(key,compileVirtualProjectProduct(input.project,input.options));}
    return structuredClone(products.get(key));
  };
  const make=()=>new ProgramLoader({platform:platform(),fs,bindings:{},runTask:run=>run(),compileProduct});
  const [a,b]=await Promise.all([make().load("skills/native/main.ts"),make().load("skills/native/main.ts")]) as any[];
  expect(compilerCalls).toBe(1);expect(await a.next()).toBe(1);expect(await a.next()).toBe(2);expect(await b.next()).toBe(1);
});
it("refuses an offloaded product belonging to different source",async()=>{
  const {compileVirtualProjectProduct}=await import("../vendor/workerd/natlang-workerd.js");
  const product=compileVirtualProjectProduct({files:{"main.ts":"export const value=1;"}},{target:"node",adaptation:false});
  expect(()=>compileProgram({platform:platform(),files:{"main.ts":"export const value=2;"},entry:"main.ts",label:"skills/native/main.ts",product})).toThrow("different source files");
});

it("keeps TS workspace branches and portable types conditional on their real mounted dependencies", async () => {
  const files={
    "skills/library/natlang.json":JSON.stringify({workspaceModules:{"release/input":"skills/release-input"},workspaceBranches:{release:{mounts:["release/input"],types:["ReleaseResult"]}}}),
    "skills/library/overview.nl":BRIEF,
    "skills/library/release.ts":'import read from "./release/input/read.nl"; export default async function release(text:string):Promise<string>{return await read(text);}',
    "skills/library/release/types.ts":'export type ReleaseResult = {value:string};',
  };
  const missing=await new ProgramLoader({platform:platform(),bindings:{},runTask:run=>run(),fs:memoryFs(files)}).describe("skills/library/overview.nl");
  expect(missing.functions.map(fn=>fn.source)).not.toContain("release.ts");
  const ready=new ProgramLoader({platform:platform(),bindings:{},runTask:run=>run(),fs:memoryFs({...files,"skills/release-input/read.nl":BRIEF})});
  const callable=await ready.load("skills/library/release.ts") as {default:(text:string)=>Promise<string>};
  expect(typeof callable.default).toBe("function");
  expect(callable.default.name).toBe("release");
});

it("keeps runtime programs without retaining caller-facing declaration documents", async () => {
  const files={"skills/lifetime/main.ts":"let n=0; export function next():number{return ++n;}","skills/lifetime/answer.nl":"---\nargs: {}\nreturns: string\n---\nAnswer."};
  const loader=new ProgramLoader({platform:platform(),fs:memoryFs(files),bindings:{},runTask:run=>run()});
  const loaded=await loader.load("skills/lifetime/main.ts") as {next():Promise<number>};
  expect(await loaded.next()).toBe(1);
  const cached=(loader as unknown as {compiled:Map<string,object>}).compiled;
  expect(cached.size).toBe(1);
  for(const program of cached.values())expect(Object.hasOwn(program,"declarations")).toBe(false);
  expect((await loader.describe("skills/lifetime/answer.nl")).functions.some(fn=>fn.name==="answer")).toBe(true);
  expect(await loaded.next()).toBe(2);
  const direct=compileProgram({platform:platform(),files:{"answer.nl":files["skills/lifetime/answer.nl"]},entry:"answer.nl",label:"answer.nl"});
  expect(Object.keys(direct.declarations).length).toBeGreaterThan(0);
});

 it("defaults internal runtime products to no declaration output and keeps the explicit diagnostic opt-in", async()=>{
  const {compileVirtualProjectProduct}=await import("../vendor/workerd/natlang-workerd.js");
  const files={"skills/runtime/main.ts":"let n=0;export function next():number{return ++n;}","skills/runtime/answer.nl":"---\nargs: {}\nreturns: string\n---\nAnswer."};
  const observed:Array<{option:boolean|undefined;documents:number}>=[];
  const compileProduct=async(input:ReturnType<typeof programProductInput>)=>{
    const product=compileVirtualProjectProduct(input.project,input.options);
    observed.push({option:input.options.declarations,documents:Object.keys(product.build.declarations).length});
    return product;
  };
  const make=(declarations?:boolean)=>new ProgramLoader({platform:platform(),fs:memoryFs(files),bindings:{},runTask:run=>run(),compileProduct,...(declarations===undefined?{}:{declarations})});
  const runtime=await make().load("skills/runtime/main.ts") as {next():Promise<number>};
  const diagnostic=await make(true).load("skills/runtime/main.ts") as {next():Promise<number>};
  expect(observed[0]).toEqual({option:false,documents:0});
  expect(observed[1].option).toBeUndefined();expect(observed[1].documents).toBeGreaterThan(0);
  expect(await runtime.next()).toBe(1);expect(await runtime.next()).toBe(2);expect(await diagnostic.next()).toBe(1);
 });
