import * as core from "../vendor/workerd/natlang-workerd.js";
import type {
  ArgumentDescription,
  FunctionDescription,
  NatlangTypeTree,
  ProgramDescription,
} from "./describeTypes.js";

type Type = ReturnType<typeof core.parseType>;
type Environment = InstanceType<typeof core.TypeEnv>;

/** How the runtime marks a compiled natlang callable (`Symbol.for("natlang.callable")`). */
const NATLANG_CALLABLE = Symbol.for("natlang.callable");

/** The part of a callable's definition a description reads. */
interface Definition {
  name: string;
  source?: string;
  description?: string;
  params: { name: string; type: string; optional?: boolean }[];
  returns: string;
  types: Record<string, string>;
  readout?: string;
  model?: string;
}

/** The definition of a compiled natlang callable: a named `.nl` function, not a TypeScript module's export. */
function definitionOf(value: unknown): Definition | undefined {
  if (typeof value !== "function") return undefined;
  const meta = (value as unknown as Record<symbol, { kind?: string; definition?: Definition } | undefined>)[
    NATLANG_CALLABLE
  ];
  return meta?.kind === "named" ? meta.definition : undefined;
}

/**
 * Field doc comments of a type alias's text: the `/** ... *\/` written directly before a field of the alias's record.
 * Natlang reads these the same way from a program's `types.ts` for its argument forms.
 */
function fieldDocs(types: Readonly<Record<string, string>>): Record<string, Record<string, string>> {
  const docs: Record<string, Record<string, string>> = {};
  for (const [alias, text] of Object.entries(types)) {
    for (const match of text.matchAll(/\/\*\*([\s\S]*?)\*\/\s*(?:readonly\s+)?["']?([\w$-]+)["']?\??\s*:/g)) {
      const doc = match[1]!
        .split("\n")
        .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
      if (doc) (docs[alias] ??= {})[match[2]!] = doc;
    }
  }
  return docs;
}

function describeType(
  name: string,
  typeText: string,
  required: boolean,
  env: Environment,
  docs: Record<string, Record<string, string>>,
  parse: typeof core.parseType
): ArgumentDescription {
  let type: Type;
  try {
    type = parse(typeText);
  } catch (error) {
    return {
      name,
      type: typeText,
      text: typeText,
      required,
      tree: { kind: "prim", name: "unknown" },
      problem: error instanceof Error ? error.message : String(error),
    };
  }
  let problem: string | undefined;
  try {
    env.checkNames(type);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  const text = core.formatType(type);
  // Expansion can return nodes of the parsed syntax. Keep each public tree independent.
  const tree = structuredClone(core.expandType(type, env, docs)) as NatlangTypeTree;
  return { name, type: text, text, required, tree, ...(problem ? { problem } : {}) };
}

function describeFunction(definition: Definition, source: string, parse: typeof core.parseType): FunctionDescription {
  const aliases: Record<string, Type> = {};
  for (const [alias, text] of Object.entries(definition.types)) {
    try {
      aliases[alias] = parse(text);
    } catch {
      aliases[alias] = parse("unknown");
    }
  }
  const env = new core.TypeEnv(aliases);
  const docs = fieldDocs(definition.types);
  const fields = definition.params.map((param) =>
    describeType(param.name, param.type, !param.optional, env, docs, parse)
  );
  return {
    name: definition.name,
    source,
    ...(definition.description ? { description: definition.description } : {}),
    params: definition.params.map((param) => `${param.name}${param.optional ? "?" : ""}: ${param.type}`),
    returns: definition.returns,
    fields,
    result: describeType("expected result", definition.returns, true, env, docs, parse),
    ...(definition.readout ? { readout: definition.readout } : {}),
    ...(definition.model ? { model: definition.model } : {}),
  };
}

/**
 * Describe a loaded program value: a callable, a record of callables (a callable folder), or a module's exports. Every
 * named `.nl` function found, nested ones included, is described once, by its source path relative to `root`.
 */
export function describeProgram(
  value: unknown,
  root: string,
  services: readonly string[],
  serviceScopes: Readonly<Record<string, readonly string[]>>
): ProgramDescription {
  const functions = new Map<string, FunctionDescription>();
  // A mounted program repeats alias declarations across its functions. Reuse only the
  // parsed syntax for this request; each function resolves names in its own lexical scope.
  const parsedTypes = new Map<string, Type>();
  const parse = (text: string): Type => {
    const cached = parsedTypes.get(text);
    if (cached) return cached;
    const type = core.parseType(text);
    parsedTypes.set(text, type);
    return type;
  };
  const seen = new Set<unknown>();
  const visit = (item: unknown): void => {
    if (item === null || (typeof item !== "object" && typeof item !== "function") || seen.has(item)) return;
    seen.add(item);
    const definition = definitionOf(item);
    if (definition) {
      const source = (definition.source ?? `${definition.name}.nl`).replace(/^\/?project\//, "");
      if (!functions.has(source)) functions.set(source, describeFunction(definition, source, parse));
    }
    for (const child of Object.values(item as Record<string, unknown>)) visit(child);
  };
  visit(value);
  return {
    root,
    services: [...services],
    serviceScopes: Object.fromEntries(Object.entries(serviceScopes).map(([name, paths]) => [name, [...paths]])),
    functions: [...functions.values()].sort((left, right) => (left.source < right.source ? -1 : 1)),
  };
}
