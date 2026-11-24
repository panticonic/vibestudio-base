import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { ProgramLoader, readProjectFiles, type WorkspaceFs } from "../src/programs.ts";
import { workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import entries from "../../../skills/open-user-goal/entriesGenerated.ts";

/** Real installed views are Base + one workspace + SST, never the union of templates. */
export async function qualifyInstalledCodebase(workspace: string) {
  const base = fileURLToPath(new URL("../../..", import.meta.url));
  const templateRoot = process.env.VIBESTUDIO_TEMPLATE_CHECKOUTS ?? dirname(base);
  const overrides = JSON.parse(process.env.VIBESTUDIO_SEMANTIC_TEMPLATE_OVERRIDES ?? "{}");
  const roots = [...new Set([base, ...(workspace === "base" ? [] : [overrides[workspace] ?? join(templateRoot, workspace)]), overrides["system-testing"] ?? join(templateRoot, "system-testing")])];
  const skills = new Map<string, string>();
  for (const source of roots) for (const entry of await readdir(join(source, "skills"), { withFileTypes: true }))
    if (entry.isDirectory() && !skills.has(`skills/${entry.name}`)) skills.set(`skills/${entry.name}`, join(source, "skills", entry.name));
  const sourceFiles = new Map<string, Record<string, string>>();
  for (const [root, source] of skills) sourceFiles.set(root, await readProjectFiles({ readFile: p => readFile(join(source, p), "utf8"), readdir: (p, options) => readdir(join(source, p), options), stat: p => stat(join(source, p)) }, "."));
  const filesUnder = (requested: string) => [...sourceFiles].flatMap(([root, files]) => Object.entries(files).map(([path, content]) => ({ path: `${root}/${path}`, content })).filter(file => file.path.startsWith(requested + "/")));
  const present = (requested: string) => sourceFiles.has(requested) || filesUnder(requested).length > 0;
  // A real campaign supplies its immutable binding catalog. The default checks
  // every entry whose declared optional feature is installed in this view.
  const catalog = process.env.VIBESTUDIO_SEMANTIC_CATALOG_BINDINGS;
  const assigned = catalog ? (await readFile(catalog, "utf8")).trim().split("\n").map(line => JSON.parse(line)).filter(row => row.workspace === workspace).map(row => row.entry) : [];
  const configuration = JSON.parse(sourceFiles.get("skills/open-user-goal")!["natlang.json"]!);
  const branches = Object.entries(configuration.workspaceBranches) as Array<[string, { mounts?: string[]; dependsOn?: string[] }]>;
  const unavailable = new Set(branches.filter(([, branch]) => (branch.mounts ?? []).some(mount => !present(configuration.workspaceModules[mount]))).map(([path]) => path));
  for (let pass = 0; pass < branches.length; pass++) for (const [path, branch] of branches)
    if (branch.dependsOn?.some(dependency => unavailable.has(dependency))) unavailable.add(path);
  const applicable = Object.values(entries).filter(entry => present(dirname(entry.program)) && ![...unavailable].some(path => entry.program === `skills/open-user-goal/${path}.nl` || entry.program === `skills/open-user-goal/${path}.ts` || entry.program.startsWith(`skills/open-user-goal/${path}/`)));
  const assignments = [...applicable, ...assigned];
  if (!assignments.length) throw Error(`No assigned catalog entries for ${workspace}`);
  const unique = [...new Map(assignments.map(entry => [entry.callable, entry])).values()];
  for (const directory of new Set(unique.map(entry => dirname(entry.program)))) {
  const owner = [...skills.keys()].find(root => directory === root || directory.startsWith(root + "/"));
  if (!owner || !present(directory)) throw Error(`Required catalog skill absent: ${workspace}/${directory}`);
  sourceFiles.get(owner)![directory === owner ? "qualificationContracts.ts" : directory.slice(owner.length + 1) + "/qualificationContracts.ts"] = unique.filter(entry => dirname(entry.program) === directory).map((entry, index) => {
    const module = "./" + entry.program.slice(directory.length + 1).replace(/\.ts$/, ".js");
    const contract = entry.resultType.replace(/\b(?!null\b)[A-Za-z_][A-Za-z_0-9]*\b/g, name => `Contract${index}.${name}`);
    return `import callable${index} from ${JSON.stringify(module)};\nimport type * as Contract${index} from "./types.js";\ntype Result${index} = ${contract};\nconst result${index}: (Awaited<ReturnType<typeof callable${index}>> extends Result${index} ? (Result${index} extends Awaited<ReturnType<typeof callable${index}>> ? true : false) : false) = true;\nconst arity${index}: Parameters<typeof callable${index}>["length"] = ${entry.parameterNames.length};`;
  }).join("\n");
  }
  const snapshot = createHash("sha256").update(JSON.stringify([...sourceFiles])).digest("hex");
  const requests: Array<{ roots: string[]; expectedSnapshot?: string }> = [];
  const fs: WorkspaceFs = {
    async readFile() { throw Error("Qualification must use the semantic source snapshot"); },
    async readdir() { throw Error("Qualification must use the semantic source snapshot"); },
    async stat(path) { return { isDirectory: () => present(path) }; },
    async readProgramSources(request) {
      requests.push(request);
      if (request.expectedSnapshot && request.expectedSnapshot !== snapshot) throw Error("Stale installed snapshot");
      const selected = request.roots.filter(present);
      return { snapshot, directories: selected, files: [...new Map(selected.flatMap(filesUnder).map(file => [file.path, file])).values()] };
    },
  };
  const loader = new ProgramLoader({ fs, bindings: {}, runTask: run => run(), platform: workerdPlatform({ realm: { call: (body, params, args) => Function(...params, body)(...args) } }) });
  const valuesByDirectory = new Map<string, Record<string, unknown>>();
  for (const directory of new Set(unique.map(entry => dirname(entry.program)))) valuesByDirectory.set(directory, await loader.load(directory) as Record<string, unknown>);
  const checked = new Set<string>();
  for (const entry of assignments) {
    const key = entry.program + "#" + entry.callable;
    if (checked.has(key)) continue;
    checked.add(key);
    const callable = valuesByDirectory.get(dirname(entry.program))![entry.callable];
    if (typeof callable !== "function") throw Error(`Required catalog callable absent: ${workspace}/${entry.callable}`);

  }
  if (valuesByDirectory.get("skills/open-user-goal")!.runUserGoal !== undefined) throw Error("Generic goal wrapper returned");
  if (requests[1]!.expectedSnapshot !== snapshot || requests.some(request => request.expectedSnapshot && request.expectedSnapshot !== snapshot)) throw Error("Mounts did not share the installed semantic snapshot");
  return { workspace, installedSkills: skills.size, sourceFiles: [...sourceFiles.values()].reduce((n, files) => n + Object.keys(files).length, 0), snapshot, snapshotReads: requests.length, compiledCodebases: valuesByDirectory.size, assignedTasks: assigned.length, requiredEntries: checked.size };
}
