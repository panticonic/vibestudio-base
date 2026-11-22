import { expect, it } from "vitest";
import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { compileProgram, readProjectFiles, type WorkspaceFs } from "./programs.js";
import { linkWorkspaceModules } from "./workspaceModules.js";
import entries from "../../../skills/open-user-goal/entriesGenerated.js";

const directories = [...new Set(Object.values(entries).map(entry => dirname(entry.program)))];

it.each(directories)("compiles every application entry in %s against its complete installed codebase", async directory => {
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
  const local = await readProjectFiles(fs, directory);
  const linked = await linkWorkspaceModules(directory, local, async roots => {
    const installed = new Map<string, Record<string, string>>();
    for (const root of roots) {
      try {
        await fs.stat(root);
        installed.set(root, await readProjectFiles(fs, root));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return installed;
  });
  const platform = workerdPlatform({ realm: { call() { throw new Error("Compile only"); } } });
  const compiled = compileProgram({ platform, files: linked, entry: "", label: directory, root: directory });
  const values = compiled.value as Record<string, unknown>;
  // Compilation checks the entire hierarchy. The runtime metadata gives exact
  // entry signatures without expanding every nested alias into editor forms.
  for (const [kind, entry] of Object.entries(entries)) {
    if (dirname(entry.program) !== directory) continue;
    const callable = values[entry.callable];
    expect(typeof callable, `${kind}: ${entry.program}`).toBe("function");
    const metadata = (callable as unknown as Record<symbol, {
      definition: { params: { name: string }[]; returns: string; types: Record<string, string> };
    }>)[Symbol.for("natlang.callable")];
    expect(metadata.definition.params.map(field => field.name), kind).toEqual(entry.parameterNames);
    expect(metadata.definition.returns, kind).toBe(entry.resultType);
    expect(metadata.definition.types[entry.resultType], `${kind}: declared result`).toBeDefined();
  }
  if (directory === "skills/open-user-goal") {
    expect(values.runUserGoal).toBeUndefined();
    expect(linked["correctVaultFromPdf/pdf/workOnPdfGoal.nl"]).toBeDefined();
    expect(linked["correctVaultFromPdf/vault/workTowardVaultGoal.nl"]).toBeDefined();
    expect(linked["workOnRecoveryHandoff/scratch/assembleHandoff.nl"]).toBeDefined();
  }
}, 180_000);
