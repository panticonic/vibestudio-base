import fs from "node:fs";
import path from "node:path";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { compileProgram, readProjectFiles, type WorkspaceFs } from "./programs.js";

/**
 * Static checking of the workspace's natlang programs, for a unit's test suite
 * (`pnpm test:userland` runs it with the rest): every program is compiled the
 * way `natlang.load` compiles it (types, `nl` signatures, the callable-folder
 * policy, declared services), but nothing is executed.
 */

/** Source folders programs can live in. */
const PROGRAM_SOURCE_DIRECTORIES = [
  "skills",
  "packages",
  "workers",
  "panels",
  "extensions",
  "templates",
  "projects",
  "agents",
];

const NOT_PROGRAM_DIRECTORIES = new Set(["node_modules", "dist", "vendor", "vendor-dashboard"]);

/** Directories that directly hold a `.nl` file and sit below no other such directory: each is one program. */
export function discoverProgramRoots(workspace: string): string[] {
  const roots: string[] = [];
  const walk = (directory: string, insideProgram: boolean): void => {
    const entries = fs.readdirSync(path.join(workspace, directory), { withFileTypes: true });
    const holdsNl = entries.some((entry) => entry.isFile() && entry.name.endsWith(".nl"));
    if (holdsNl && !insideProgram) roots.push(directory);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || NOT_PROGRAM_DIRECTORIES.has(entry.name)) {
        continue;
      }
      walk(path.posix.join(directory, entry.name), insideProgram || holdsNl);
    }
  };
  for (const source of PROGRAM_SOURCE_DIRECTORIES) {
    if (fs.existsSync(path.join(workspace, source))) walk(source, false);
  }
  return roots;
}

export interface ProgramCheck {
  readonly program: string;
  /** The compile diagnostics, empty when the program checks. */
  readonly failure: string | null;
}

/**
 * Programs import each other's `.nl` files from TypeScript, and the workspace
 * type-check reads those imports through the `.d.nl.ts` declaration natlang
 * generates beside every `.nl` file (`allowArbitraryExtensions`). They are
 * generated, so they are checked in sync with the sources rather than edited:
 * a stale one is a failure, and `NATLANG_UPDATE_DECLARATIONS=1` writes the
 * current ones (the way a snapshot test updates its snapshots).
 */
export const UPDATE_DECLARATIONS_ENV = "NATLANG_UPDATE_DECLARATIONS";

/**
 * Compile every natlang program under `workspace` (a template checkout or any
 * workspace root). A failure carries the diagnostics natlang would show.
 */
export async function checkWorkspaceNatlangPrograms(
  workspace: string,
  options: { updateDeclarations?: boolean } = {}
): Promise<ProgramCheck[]> {
  const files: WorkspaceFs = {
    readFile: async (file) => fs.readFileSync(path.join(workspace, file), "utf8"),
    readdir: async (directory) => fs.readdirSync(path.join(workspace, directory), { withFileTypes: true }),
    stat: async (file) => fs.statSync(path.join(workspace, file)),
  };
  // Nothing is executed, so the platform's realm is never asked to run code.
  const platform = workerdPlatform({
    realm: {
      call() {
        throw new Error("static checking does not execute programs");
      },
    },
  });
  const checks: ProgramCheck[] = [];
  for (const root of discoverProgramRoots(workspace)) {
    const programFiles = await readProjectFiles(files, root);
    try {
      const { declarations } = compileProgram({ platform, files: programFiles, entry: "", label: root });
      const stale: string[] = [];
      for (const [relative, text] of Object.entries(declarations)) {
        const file = path.join(workspace, root, relative);
        const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        if (current === text) continue;
        if (options.updateDeclarations) fs.writeFileSync(file, text);
        else stale.push(path.posix.join(root, relative));
      }
      checks.push({
        program: root,
        failure: stale.length
          ? `declarations out of date: ${stale.join(", ")}; run the test with ${UPDATE_DECLARATIONS_ENV}=1 to write them`
          : null,
      });
    } catch (error) {
      checks.push({ program: root, failure: error instanceof Error ? error.message : String(error) });
    }
  }
  return checks;
}

/**
 * What a template's test suite asserts about its natlang programs: every program compiles and its generated
 * declarations are current, as one line per failing program (empty when all pass).
 * `NATLANG_UPDATE_DECLARATIONS=1` writes the declarations instead of failing on them.
 */
export async function workspaceProgramFailures(workspace: string): Promise<string[]> {
  const checks = await checkWorkspaceNatlangPrograms(workspace, {
    updateDeclarations: process.env[UPDATE_DECLARATIONS_ENV] === "1",
  });
  return checks.filter((check) => check.failure).map((check) => `${check.program}: ${check.failure}`);
}
