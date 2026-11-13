import { serviceDeclarations, selectServices } from "@workspace/natlang-services";
import { NatlangProgramError } from "./programError.js";

/** The module programs import services from. */
const SERVICES_MODULE = "natlang:services";

const IDENTIFIER = "[A-Za-z_$][\\w$]*";

/** The text between the braces that open at `open` (which is the index of `{`), nesting included. */
function balancedBody(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}" && (depth -= 1) === 0) return source.slice(open + 1, index);
  }
  return source.slice(open + 1);
}

/** Names exported by the `declare module 'natlang:services'` blocks of a declaration file. */
function declaredByModule(source: string): string[] {
  const names: string[] = [];
  const block = new RegExp(`declare\\s+module\\s+['"]${SERVICES_MODULE}['"]\\s*\\{`, "g");
  for (let match = block.exec(source); match; match = block.exec(source)) {
    const body = balancedBody(source, match.index + match[0].length - 1);
    for (const exported of body.matchAll(
      new RegExp(
        `export\\s+(?:declare\\s+)?(?:const|let|var|function|class|namespace)\\s+(${IDENTIFIER})`,
        "g"
      )
    )) {
      names.push(exported[1]!);
    }
    for (const list of body.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const entry of list[1]!.split(",")) {
        const parts = entry.trim().split(/\s+as\s+/);
        const name = parts.at(-1)?.trim();
        if (name) names.push(name);
      }
    }
  }
  return names;
}

/** Names a TypeScript file imports from `natlang:services`. */
function importedFromModule(source: string): string[] {
  const names: string[] = [];
  const statement = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${SERVICES_MODULE}['"]`,
    "g"
  );
  for (const match of source.matchAll(statement)) {
    for (const entry of match[1]!.split(",")) {
      const original = entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (original) names.push(original);
    }
  }
  return names;
}

/**
 * The services a program declares: what its `declare module 'natlang:services'`
 * blocks export (the program's `.d.ts` files, which is how a `.nl`-only program
 * says what its model may use), and what its TypeScript modules import from
 * `natlang:services`. These names, and no others, are the authority the program's
 * calls receive.
 */
export function declaredServiceNames(files: Readonly<Record<string, string>>): string[] {
  const names = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith(".d.ts")) for (const name of declaredByModule(text)) names.add(name);
    else if (/\.[cm]?tsx?$/.test(path)) for (const name of importedFromModule(text)) names.add(name);
  }
  return [...names].sort();
}

/** The model-facing declarations for the named services (a name without one is listed by its methods only). */
export function declarationsFor(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const text = serviceDeclarations[name];
      return text === undefined ? [] : [[name, text]];
    })
  );
}

/**
 * The service record for a program: exactly its declared services, each a
 * narrowed view of the caller's own binding, so every authority check and
 * approval of the binding applies unchanged. An unknown name, or a service the
 * eval does not have a binding for, is refused with the program's name.
 */
export function servicesFor(
  program: string,
  names: readonly string[],
  bindings: Readonly<Record<string, unknown>>
) {
  try {
    return selectServices(bindings, names);
  } catch (error) {
    // The message carries the reason; a `cause` would only repeat it where the failure is shown.
    throw new NatlangProgramError(
      `natlang program ${program} cannot get its services: ${error instanceof Error ? error.message : String(error)}`,
      program,
      "services-unavailable"
    );
  }
}
