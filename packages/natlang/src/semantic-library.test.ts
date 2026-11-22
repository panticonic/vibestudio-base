import { expect, it } from "vitest";
import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { ProgramLoader, type WorkspaceFs } from "./programs.js";
import entries from "../../../skills/open-user-goal/entriesGenerated.js";

it("compiles every declared application entry against its complete installed codebase", async () => {
  const base = fileURLToPath(new URL("../../..", import.meta.url));
  const templateRoot = process.env.VIBESTUDIO_TEMPLATE_CHECKOUTS ?? dirname(base);
  const overrides = JSON.parse(process.env.VIBESTUDIO_SEMANTIC_TEMPLATE_OVERRIDES ?? "{}") as Record<string, string>;
  const roots = [base, ...["system", "personal", "google-workspace", "examples", "news", "spectrolite", "system-testing"]
    .map(name => overrides[name] ?? join(templateRoot, name))];
  async function first<T>(relative: string, read: (path: string) => Promise<T>): Promise<T> {
    for (const root of roots) {
      try { return await read(join(root, relative)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw Object.assign(new Error(`Missing installed source ${relative}`), { code: "ENOENT" });
  }
  const fs: WorkspaceFs = {
    readFile: relative => first(relative, path => readFile(path, "utf8")),
    stat: relative => first(relative, stat),
    async readdir(relative) {
      const result = new Map<string, Dirent>();
      for (const root of roots) {
        try {
          for (const entry of await readdir(join(root, relative), { withFileTypes: true }))
            if (!result.has(entry.name)) result.set(entry.name, entry);
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      return [...result.values()];
    },
  };
  const loader = new ProgramLoader({ platform: workerdPlatform({ realm: { call() { throw new Error("Compile only"); } } }),
    fs, bindings: {}, runTask: run => run() });
  const programs = new Map<string, Awaited<ReturnType<typeof loader.describe>>>();
  for (const [kind, entry] of Object.entries(entries)) {
    const directory = dirname(entry.program);
    if (!programs.has(directory)) programs.set(directory, await loader.describe(directory));
    const described = programs.get(directory)!;
    const fn = described.functions.find(fn => fn.source === `${entry.callable}.nl`);
    expect(fn, `${kind}: ${entry.program}`).toBeDefined();
    expect(fn!.fields.map(field => field.name), kind).toEqual(entry.parameterNames);
    expect(fn!.returns, kind).toBe(entry.resultType);
    expect(fn!.fields.some(field => field.problem), kind).toBe(false);
    expect(fn!.result.problem, kind).toBeUndefined();
  }
  const library = programs.get("skills/open-user-goal")!;
  expect(library.functions.some(fn => fn.name === "runUserGoal")).toBe(false);
  expect(library.functions.map(fn => fn.source)).toEqual(expect.arrayContaining([
    "correctVaultFromPdf/pdf/workOnPdfGoal.nl",
    "correctVaultFromPdf/vault/workTowardVaultGoal.nl",
    "workOnRecoveryHandoff/scratch/assembleHandoff.nl",
  ]));
}, 180_000);
