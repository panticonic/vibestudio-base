import { sha256 } from "@noble/hashes/sha2.js";
import * as core from "../vendor/workerd/natlang-workerd.js";
import {
  compileVirtualProject,
  formatDiagnostics,
  loadVirtualCallables,
  loadVirtualNatlang,
  type Platform,
} from "../vendor/workerd/natlang-workerd.js";
import { describeProgram } from "./describe.js";
import type { ProgramDescription } from "./describeTypes.js";
import { NatlangProgramError } from "./programError.js";
import { declarationsFor, declaredServiceNames, servicesFor } from "./services.js";

export { NatlangProgramError };

/** The parts of the eval `fs` binding program loading reads. */
export interface WorkspaceFs {
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  readdir(
    path: string,
    options: { withFileTypes: true }
  ): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

/** The root every program's in-memory project is mounted at. */
const PROJECT_ROOT = "/project";

/** Files a natlang program is made of; anything else in its folder is not read. */
const PROGRAM_FILE = /\.(?:nl|tsx?|jsx?|json|md|ya?ml)$/;

/**
 * Files that sit beside a program without being part of it: the tests of the code
 * (`*.test.ts`) and its evaluation suite (`suite.ts`, run by `pnpm natlang:eval`
 * against the program, never loaded into an eval cell).
 */
const BESIDE_PROGRAM = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|^suite\.[cm]?tsx?$)/;

/** Generated declarations of a `.nl` file (`foo.d.nl.ts`): an output of compiling the program, never an input. */
const GENERATED_DECLARATION = /\.d\.nl\.ts$/;

/** Folders never part of a program. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist"]);

/** Compiled programs kept per loader (a cache bound: an evicted program recompiles on its next load). */
const PROGRAMS_KEPT = 32;


const IMPORT_ROOTS: Readonly<Record<string, string>> = {
  "@workspace-skills/": "skills/",
  "@workspace-panels/": "panels/",
  "@workspace-workers/": "workers/",
  "@workspace-agents/": "agents/",
  "@workspace-extensions/": "extensions/",
  "@workspace/": "packages/",
};

/** A workspace path from what a caller wrote: a workspace-relative path, or an import-style specifier. */
export function workspacePath(specifier: string): string {
  const imported = Object.entries(IMPORT_ROOTS).find(([prefix]) => specifier.startsWith(prefix));
  const path = imported ? `${imported[1]}${specifier.slice(imported[0].length)}` : specifier;
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The files of the program rooted at `directory`, keyed by their path relative to it. */
export async function readProjectFiles(
  fs: WorkspaceFs,
  directory: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const decoder = new TextDecoder();
  const walk = async (relative: string): Promise<void> => {
    const entries = await fs.readdir(relative ? `${directory}/${relative}` : directory, {
      withFileTypes: true,
    });
    await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith("."))
        .map(async (entry) => {
          const child = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(child);
          } else if (PROGRAM_FILE.test(entry.name) && !BESIDE_PROGRAM.test(entry.name) && !GENERATED_DECLARATION.test(entry.name)) {
            const content = await fs.readFile(`${directory}/${child}`, "utf8");
            files[child] = typeof content === "string" ? content : decoder.decode(content);
          }
        })
    );
  };
  await walk("");
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1)));
}

/** A program's content identity: its files and the services it declares. */
export function programKey(files: Readonly<Record<string, string>>, services: readonly string[]): string {
  return hex(sha256(new TextEncoder().encode(JSON.stringify([Object.entries(files), services]))));
}

export interface CompiledProgram {
  /** The callable, record of callables, or module exports the path names, not yet bound to a task. */
  readonly value: unknown;
  readonly services: readonly string[];
  /** The `.d.nl.ts` declarations TypeScript reads for the program's `.nl` imports, by path relative to its root. */
  readonly declarations: Readonly<Record<string, string>>;
}

/**
 * Compile a program's files the way a project build does (types, `nl` signatures,
 * the callable-folder policy) and load what `entry` names: a `.nl` file is its
 * function, a `.ts` file its module's exports, and no entry the folder as a
 * record. Throws `NatlangProgramError` with the diagnostics when it does not compile.
 */
export function compileProgram(options: {
  platform: Platform;
  files: Record<string, string>;
  entry: string;
  /** Names the program in diagnostics. */
  label: string;
  /** The workspace folder the files are relative to: diagnostics name workspace paths. */
  root?: string;
}): CompiledProgram {
  const { platform, files, entry, label, root = "" } = options;
  const services = declaredServiceNames(files);
  const compiled = compileVirtualProject(
    { files, root: PROJECT_ROOT },
    core as unknown as Record<string, unknown>,
    {
      platform,
      programId: label,
      ...(services.length > 0 ? { services: { declarations: declarationsFor(services), scopes: {} } } : {}),
    }
  );
  if (!compiled.ok) {
    // The compiler names files in the in-memory project (relative to it, or under its mount point); the author
    // knows them by their workspace paths.
    const workspaceFile = (file: string) => {
      const relative = file.startsWith(`${PROJECT_ROOT}/`) ? file.slice(PROJECT_ROOT.length + 1) : file;
      return root ? `${root}/${relative}` : relative;
    };
    throw new NatlangProgramError(
      `natlang program ${label} does not compile:\n${formatDiagnostics(
        compiled.diagnostics.map((diagnostic) => ({ ...diagnostic, file: workspaceFile(diagnostic.file) }))
      )}`,
      label,
      "does-not-compile"
    );
  }
  let value: unknown;
  if (!entry) value = loadVirtualCallables(files, "", PROJECT_ROOT, platform);
  else if (entry.endsWith(".nl")) value = loadVirtualNatlang(files, entry, PROJECT_ROOT, platform);
  else value = compiled.require(entry);
  const declarations = Object.fromEntries(
    Object.entries(compiled.declarations).map(([path, text]) => [
      path.startsWith(`${PROJECT_ROOT}/`) ? path.slice(PROJECT_ROOT.length + 1) : path,
      text,
    ])
  );
  return { value, services, declarations };
}

/** Runs one call of a program as a task of its own, with the program's services. */
export type TaskRunner = <T>(
  run: () => Promise<T>,
  task: {
    services: Record<string, object>;
    serviceDeclarations: Record<string, string>;
    /** The workspace folder of the program the task runs: recorded with each of its calls. */
    programRoot?: string;
  }
) => Promise<T>;

/**
 * Bind a loaded program to its services. Every callable of the program starts a
 * natlang task whose services are exactly the program's declared ones, so the
 * program's functions (and the calls they make) can use them and the calling
 * cell's own inline `nl` calls cannot.
 */
export function bindProgram(value: unknown, task: Parameters<TaskRunner>[1], runTask: TaskRunner): unknown {
  const bind = (item: unknown): unknown => {
    if (typeof item === "function") {
      const call = item as (...args: unknown[]) => Promise<unknown>;
      const bound = function (this: unknown, ...args: unknown[]) {
        return runTask(() => call.apply(this, args), task);
      };
      Object.defineProperty(bound, "name", { value: call.name });
      // `fn.on({ model })` of a natlang function: the same function on another model, bound to the same services.
      const on = (item as { on?: unknown }).on;
      if (typeof on === "function") {
        Object.defineProperty(bound, "on", { value: (options: unknown) => bind(on.call(item, options)) });
      }
      for (const [key, child] of Object.entries(item)) {
        Object.defineProperty(bound, key, { value: bind(child), enumerable: true });
      }
      return bound;
    }
    if (item !== null && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, bind(child)]));
    }
    return item;
  };
  return bind(value);
}

/**
 * `natlang.load`: workspace natlang programs read through the eval `fs` binding,
 * compiled once per content (a cache keyed by the files' hash, so editing a
 * program recompiles it and an unchanged one loads instantly).
 */
export class ProgramLoader {
  private readonly compiled = new Map<string, CompiledProgram>();

  constructor(
    private readonly options: {
      platform: Platform;
      fs: WorkspaceFs;
      bindings: Readonly<Record<string, unknown>>;
      runTask: TaskRunner;
    }
  ) {}

  /** The program a specifier names, compiled (a cache hit when its files are unchanged). */
  private async compiledProgram(specifier: string): Promise<{
    path: string;
    root: string;
    program: CompiledProgram;
  }> {
    const { fs, platform } = this.options;
    const path = workspacePath(specifier);
    if (!path) throw new NatlangProgramError("natlang.load needs a workspace path", specifier, "invalid-path");
    const directory = (await fs.stat(path)).isDirectory();
    const slash = path.lastIndexOf("/");
    const root = directory ? path : slash < 0 ? "" : path.slice(0, slash);
    const entry = directory ? "" : path.slice(slash + 1);
    if (!directory && !/\.(?:nl|tsx?)$/.test(entry)) {
      throw new NatlangProgramError(
        `natlang.load takes a .nl file, a .ts module or a folder of them; ${path} is none of those`,
        path,
        "invalid-path"
      );
    }
    const files = await readProjectFiles(fs, root || ".");
    const key = programKey(files, declaredServiceNames(files));
    let program = this.compiled.get(`${path}\u0000${key}`);
    if (!program) {
      program = compileProgram({ platform, files, entry, label: path, root });
      this.compiled.set(`${path}\u0000${key}`, program);
      if (this.compiled.size > PROGRAMS_KEPT) {
        this.compiled.delete(this.compiled.keys().next().value as string);
      }
    }
    return { path, root, program };
  }

  async load(specifier: string): Promise<unknown> {
    const { bindings, runTask } = this.options;
    const { path, root, program } = await this.compiledProgram(specifier);
    const services = servicesFor(path, program.services, bindings);
    return bindProgram(
      program.value,
      { services, serviceDeclarations: declarationsFor(program.services), programRoot: root },
      runTask
    );
  }

  /**
   * `natlang.describe`: the functions a program defines with their typed signatures, from the same compilation
   * `load` runs (so a program that does not type-check fails here with the same diagnostics). Nothing is bound or run.
   */
  async describe(specifier: string): Promise<ProgramDescription> {
    const { root, program } = await this.compiledProgram(specifier);
    return describeProgram(program.value, root, program.services);
  }
}
