import { describe, expect, it } from "vitest";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import {
  NatlangProgramError,
  ProgramLoader,
  bindProgram,
  compileProgram,
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
