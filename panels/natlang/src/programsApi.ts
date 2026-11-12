import type { ProgramDescription } from "@workspace/natlang/describe-types";
import { SERVICE_CATALOG } from "@workspace/natlang-services/catalog";
import { DashboardError, evaluateValue, type NatlangPanelPorts } from "./ports.js";

type Json = Record<string, any>;

/** The services a program declares that exist only in an agent's eval: a run started by the user has none to give. */
export function agentOnlyServices(services: readonly string[]): string[] {
  return SERVICE_CATALOG.filter((entry) => "requiresAgent" in entry && services.includes(entry.name)).map((entry) => entry.name);
}

/** Workspace folders searched for natlang programs: skills, projects and packages hold them. */
export const PROGRAM_ROOTS = ["skills", "projects", "packages"] as const;
/** Folders that are never part of a program (and are not searched). */
const SKIPPED = new Set(["node_modules", "dist", "build", "coverage"]);
const SOURCE_BYTES = 512_000;
const EXAMPLES_FILE = "examples.json";

const text = (content: string | Uint8Array): string =>
  typeof content === "string" ? content : new TextDecoder().decode(content);

/** `skills/a/b` from `skills/a/b/`, `.` for the workspace root. */
const normalize = (path: string): string => path.replace(/^\.?\/+/, "").replace(/\/+$/, "") || ".";
const join = (directory: string, name: string) => (directory === "." ? name : `${directory}/${name}`);

/** The source of `expression` as a JavaScript string literal. */
const literal = (value: unknown) => JSON.stringify(value);

/** Workspace paths of every `.nl` file under the program roots (one recursive listing per root). */
export async function nlFiles(fs: NatlangPanelPorts["fs"]): Promise<string[]> {
  const lists = await Promise.all(
    PROGRAM_ROOTS.map((root) =>
      fs.readdir(root, { recursive: true }).then(
        (paths) => paths.map((path) => `${root}/${path}`),
        // A workspace without that folder has no programs there.
        () => [] as string[]
      )
    )
  );
  return lists
    .flat()
    .filter((path) => path.endsWith(".nl"))
    .filter((path) => !path.split("/").some((part) => part.startsWith(".") || SKIPPED.has(part)))
    .sort();
}

const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));

/**
 * A natlang program's folders: every folder under skills, projects and packages that directly holds a `.nl` file and is
 * not inside another such folder (a function's own folder, `researchBrief/`, belongs to its program). A `natlang.d`
 * folder is a program of its own. `functions` counts the `.nl` files of each program, nested ones included.
 */
export function programFolders(files: readonly string[]): Array<{ directory: string; functions: number }> {
  const holders = [...new Set(files.map(dirname))].sort();
  const roots = holders.filter((directory) => !holders.some((other) => other !== directory && directory.startsWith(`${other}/`)));
  return roots.map((directory) => ({ directory, functions: files.filter((file) => file.startsWith(`${directory}/`)).length }));
}

async function readJson(fs: NatlangPanelPorts["fs"], path: string): Promise<Json | undefined> {
  try {
    return JSON.parse(text(await fs.readFile(path, "utf8"))) as Json;
  } catch {
    return undefined;
  }
}

async function readText(fs: NatlangPanelPorts["fs"], path: string): Promise<string | undefined> {
  try {
    return text(await fs.readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** The package's name and description: what a program is called in lists. */
async function identity(fs: NatlangPanelPorts["fs"], directory: string) {
  const manifest = await readJson(fs, join(directory, "package.json"));
  const base = directory.split("/").at(-1) ?? directory;
  return {
    name: typeof manifest?.["name"] === "string" ? (manifest["name"] as string).replace(/^@[^/]+\//, "") : base,
    version: typeof manifest?.["version"] === "string" ? (manifest["version"] as string) : "",
    description: typeof manifest?.["description"] === "string" ? (manifest["description"] as string) : "",
  };
}

type Example = { name?: string; function: string; inputs: Record<string, unknown>; expected: unknown };

async function readExamples(fs: NatlangPanelPorts["fs"], directory: string): Promise<Example[]> {
  const path = join(directory, EXAMPLES_FILE);
  if (!(await fs.exists(path))) return [];
  const parsed = JSON.parse(text(await fs.readFile(path, "utf8"))) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${path} must be an array of { function, inputs, expected } examples`);
  for (const item of parsed as Json[]) {
    if (
      typeof item?.["function"] !== "string" ||
      !item["function"].endsWith(".nl") ||
      !item["inputs"] ||
      typeof item["inputs"] !== "object" ||
      Array.isArray(item["inputs"]) ||
      !Object.hasOwn(item, "expected")
    )
      throw new Error(`${path}: each example needs a .nl function, an inputs object, and an expected result`);
  }
  return parsed as Example[];
}

/** Whether two JSON values are equal, key order aside. */
function sameJson(left: unknown, right: unknown): boolean {
  const canon = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canon)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Json)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([key, item]) => [key, canon(item)])
          )
        : value;
  return JSON.stringify(canon(left)) === JSON.stringify(canon(right));
}

/** `.nl` source of a function created from an instruction (the Playground's "Save as program"). */
function newFunction(spec: { instruction?: string; input?: string; returns?: string }): string {
  const instruction = spec.instruction?.trim() || "Describe what this function does here.";
  const description = instruction.split("\n")[0]!.replace(/^[-*]\s*/, "").slice(0, 160);
  return [
    "---",
    `description: ${JSON.stringify(description)}`,
    "args:",
    "  input: string",
    `returns: ${spec.returns?.trim() || "string"}`,
    "---",
    instruction,
    "",
  ].join("\n");
}

/**
 * The dashboard's `ProgramsApi` over the workspace: natlang programs are workspace source (`.nl` files and callable
 * folders), read and edited through the panel's filesystem and described by the natlang provider's own compilation
 * (`natlang.describe`, run in this panel's eval session), so the typed forms come from the types the runtime checks.
 */
export function programsApi(
  ports: Pick<NatlangPanelPorts, "fs" | "evaluate" | "newId" | "settings">,
  options: { lastCalls?: () => Record<string, Json> } = {}
) {
  const { fs } = ports;

  /** A path inside the workspace, normalized; anything that leaves it is refused. */
  const inside = (path: unknown): string => {
    if (typeof path !== "string" || !path.trim()) throw new DashboardError("path is required", 400);
    const clean = normalize(path.trim());
    if (clean.split("/").includes("..") || clean.startsWith("/"))
      throw new DashboardError(`${path} is outside the workspace`, 400);
    return clean;
  };

  const describe = (path: string) =>
    evaluateValue<ProgramDescription>(ports, `return await natlang.describe(${literal(path)});`);

  return {
    async list(): Promise<Json[]> {
      const folders = programFolders(await nlFiles(fs));
      return Promise.all(
        folders.map(async ({ directory, functions }) => {
          const { name, description } = await identity(fs, directory);
          return { name, directory, description, targets: [], functions, warm: null, builtAt: null };
        })
      );
    },

    async detail(path: string): Promise<Json> {
      const directory = inside(path);
      if (!(await fs.stat(directory).then((stat) => stat.isDirectory(), () => false)))
        throw new DashboardError(`${path} is not a folder in this workspace`, 404);
      const [{ name, version, description }, readme, examples] = await Promise.all([
        identity(fs, directory),
        (async () => {
          for (const file of ["README.md", "DECOMPOSITION.md"]) {
            const content = await readText(fs, join(directory, file));
            if (content !== undefined) return { name: file, text: content.slice(0, 20_000) };
          }
          return null;
        })(),
        readExamples(fs, directory).then(
          (list) => ({ count: list.length, problem: null as string | null }),
          (error: Error) => ({ count: 0, problem: error.message })
        ),
      ]);
      let problem: string | null = null;
      let described: ProgramDescription = { root: directory, services: [], functions: [] };
      try {
        described = await describe(directory);
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
      }
      const agentOnly = agentOnlyServices(described.services);
      // Said up front: a run from this panel would fail at load, because the program reads an agent's conversation.
      const note = agentOnly.length
        ? `This program uses ${agentOnly.join(", ")}, the view of an agent's conversation; it runs in an agent's eval, not from this panel.`
        : "";
      return {
        directory,
        manifest: { name, version, description: [description, note].filter(Boolean).join(" "), targets: {}, warmup: [] },
        problem,
        functions: described.functions,
        services: described.services,
        lastRuns: {},
        examples: examples.count,
        examplesProblem: examples.problem,
        lastCalls: options.lastCalls?.() ?? {},
        lock: null,
        tuning: null,
        readme,
        recent: [],
        forms: {},
      };
    },

    /** Programs in a workspace have no compile-time profile: every run uses the executor role. */
    async model(_path: string, _profile?: string): Promise<{ model: string; kind: string; detail: string }> {
      const role = await ports.settings.resolveRole("executor");
      return {
        model: role.model?.name ?? role.ref ?? "none",
        kind: role.source === "local" ? "managed-local" : "pi-provider",
        detail: role.reason,
      };
    },

    async checkArguments(): Promise<{ problems: Json[] }> {
      return { problems: [] };
    },

    async files(dir: string): Promise<Json> {
      const directory = inside(dir || ".");
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => undefined);
      if (!entries) return { dir: directory, entries: [], missing: true };
      return {
        dir: directory,
        entries: entries
          .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
          .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "folder" : "file" }))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1))
          .slice(0, 500),
      };
    },

    async source(path: string): Promise<{ path: string; text: string }> {
      const file = inside(path);
      const stat = await fs.stat(file).catch(() => undefined);
      if (!stat || stat.isDirectory() || (stat.size ?? 0) > SOURCE_BYTES)
        throw new DashboardError("no such source file", 404);
      return { path: file, text: text(await fs.readFile(file, "utf8")) };
    },

    /**
     * Save a source file. `previous` is the text the editor loaded: a file that changed since (another editor, an agent,
     * a merge) is refused with 409 instead of overwritten. The write is an attributed edit of the workspace, committed
     * and published through the normal source-control flow.
     */
    async saveSource(spec: { path: string; text: string; previous: string }): Promise<{ path: string }> {
      const file = inside(spec.path);
      if (!/\.(nl|ts|json)$/.test(file)) throw new DashboardError("Choose an existing .nl, .ts or .json source file.", 400);
      if (typeof spec.text !== "string" || spec.text.length > SOURCE_BYTES)
        throw new DashboardError("Source text must be at most 512 KB.", 400);
      const current = await readText(fs, file);
      if (current === undefined) throw new DashboardError("Choose an existing .nl, .ts or .json source file.", 400);
      if (current !== spec.previous)
        throw new DashboardError("This file changed in the workspace. Reload its source before saving.", 409);
      await fs.writeFile(file, spec.text);
      return { path: file };
    },

    async saveExample(spec: { path: string; example: Example }): Promise<{ examples: number }> {
      const directory = inside(spec.path);
      const example = spec.example;
      if (typeof example?.function !== "string") throw new DashboardError("Choose a function.", 400);
      const file = inside(join(directory, example.function));
      if (!file.endsWith(".nl") || !(await fs.exists(file))) throw new DashboardError("The function does not exist.", 404);
      const examples = await readExamples(fs, directory);
      // Saving an input again updates its expectation rather than growing duplicate tests.
      const previous = examples.findIndex(
        (item) => item.function === example.function && sameJson(item.inputs, example.inputs)
      );
      if (previous >= 0) examples[previous] = { ...examples[previous]!, ...example };
      else examples.push(example);
      await fs.writeFile(join(directory, EXAMPLES_FILE), `${JSON.stringify(examples, null, 2)}\n`);
      return { examples: examples.length };
    },

    async create(spec: { name: string; instruction?: string; input?: string; returns?: string; profile?: string }) {
      const name = typeof spec.name === "string" ? spec.name : "";
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name))
        throw new DashboardError("Use a directory name made of letters, numbers, dots, dashes or underscores.", 400);
      const directory = `projects/natlang/${name}`;
      if (await fs.exists(directory)) throw new DashboardError("That directory already exists. Choose a new name.", 409);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(join(directory, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`);
      await fs.writeFile(join(directory, `${name.replace(/[^A-Za-z0-9_]/g, "_")}.nl`), newFunction(spec));
      return { directory };
    },
  };
}
