import { type EnsuresClause } from './ensures.js';
import { type GenericResult } from '../native/representation.js';
export { readTypesFile } from './linked-types.js';
export type SourceFiles = {
    join(...parts: string[]): string;
    dirname(path: string): string;
    basename(path: string, extension?: string): string;
    extname(path: string): string;
    isFile(path: string): boolean;
    isDirectory(path: string): boolean;
    read(path: string): string;
    list(path: string): string[];
    /** Opt out of per-load graph sharing; source revisions are never shared across loads. */
    sourceGraphReuse?: boolean;
    /** Display path relative to the loaded root. */
    relative?(path: string): string;
    /** Binary contents, for `.nz` files. Without it, `.nz` files in callable folders are not loaded. */
    readBytes?(path: string): Uint8Array;
};
export type ExportRecord = {
    kind: 'function';
    args: Record<string, string>;
    returns: string;
    async: boolean;
    doc?: string;
    rest?: string;
} | {
    kind: 'value';
    type?: string;
};
export type NatlangRecord = {
    programId?: string;
    kind: 'natlang';
    id: string;
    name: string;
    source: string;
    revision: string;
    text: string;
    description: string;
    args: Record<string, string>;
    declaredParameters?: true;
    /** The result type; for a representation-generic result, its crisp instance (what a call with no expected type runs). */
    returns: string;
    instructions: string;
    types: Record<string, string>;
    subtype: 'function' | 'directory-reducer';
    codebase: Record<string, ItemRecord>;
    /**
     * `generic: { R: T | Neuralese<T> }` with `returns: R` in the frontmatter: a representation-generic result, which each
     * call site instantiates from the type its result is used as (native/representation.ts).
     */
    generic?: GenericResult;
    /** `readout: decision` in the frontmatter: answer by scoring the finite result values after the model's own reasoning;
     * `readout: instant`: score them without reasoning, in one pass (native/decision.ts). */
    readout?: 'decision' | 'instant' | 'template';
    /** `model: NAME` in the frontmatter: the call runs on the runtime's model of that name (`models`), else the default. */
    model?: string;
    /**
     * `uses:` in the frontmatter: package, relative (`./`, `../`), or `natlang.json` package-export items this function
     * may call besides its companion folder. List form binds under basename; map form binds under explicit alias keys.
     */
    uses?: string[];
    /** Canonical alias -> specifier map for `uses:` (populated for both list and map forms). */
    usesMap?: Record<string, string>;
    /** `withhold: [delegate]` in the frontmatter: tools this function's own calls are not offered (WITHHOLDABLE_TOOLS). */
    withhold?: string[];
    /**
     * `protect: [checks/citations.ts]` in the frontmatter: items of the companion folder that judge this function's calls
     * (verifiers, checkers, fixtures), by path from that folder. A call can read them but never edit them (edit_code).
     */
    protect?: string[];
    /** `budget: { maxTurns: 8 }` in the frontmatter: the model work one call may take, instead of its model's own budget. */
    budget?: CallBudget;
    /** `recursive: structural` in the frontmatter: the function may call itself on a smaller argument (runtime/context.ts). */
    recursive?: 'structural';
    /** `measure: <TypeScript over the arguments>`: the function may call itself where this non-negative whole number falls. */
    measure?: string;
    /** `ensures:` in the frontmatter: postconditions relating the result to the arguments (runtime/ensures.ts). */
    ensures?: EnsuresClause[];
    /**
     * Data entries of the companion folder bound by default (S0 §7): each `.nz` file's exports under the file's name,
     * as loaded (Neuralese references, data, soft-function specs). Its blocks are registered as imported blocks.
     */
    contextData?: Record<string, unknown>;
};
export type ModuleRecord = {
    programId?: string;
    kind: 'module';
    id: string;
    name: string;
    source: string;
    revision: string;
    text: string;
    types: Record<string, string>;
    exports: Record<string, ExportRecord>;
    imports: string[];
    /** TypeScript declarations of the module's classes (and method-bearing interfaces), for function listings. */
    declarations?: Record<string, string>;
    codebase: Record<string, ItemRecord>;
};
export type NamespaceRecord = {
    kind: 'namespace';
    name: string;
    source: string;
    codebase: Record<string, ItemRecord>;
};
export type ItemRecord = NatlangRecord | ModuleRecord | NamespaceRecord;
/** A source file that is not a valid natlang item: `reason` says why, at `line` (1-based) when it is known. */
export declare class NatlangSourceError extends Error {
    readonly path: string;
    readonly reason: string;
    readonly line?: number | undefined;
    readonly hint?: string | undefined;
    constructor(path: string, reason: string, line?: number | undefined, hint?: string | undefined);
}
export declare function moduleResolvedImports(record: ModuleRecord): Record<string, ItemRecord> | undefined;
/** Text of each package `.ts` file the module imports for types only, by its path from the package root. */
export declare function moduleTypeSources(record: ModuleRecord): Readonly<Record<string, string>> | undefined;
export declare const nodeKey: (record: NatlangRecord | ModuleRecord) => string;
export declare function registerFileRecords(codebase: Record<string, ItemRecord> | ItemRecord): void;
/** Whether an executable node and all its children come from files. */
export declare function isFileRecord(record: ItemRecord, seen?: Set<ItemRecord>): boolean;
/** What a `budget:` frontmatter map may bound: a call's turns, the reply tokens of one turn, all its tokens, its context window. */
export declare const CALL_BUDGET_KEYS: readonly ["maxTurns", "turnTokens", "maxTokens", "contextTokens"];
export type CallBudget = Partial<Record<typeof CALL_BUDGET_KEYS[number], number>>;
/** Optional tools a `.nl` function may withhold from its own calls (`withhold:` frontmatter). eval, return_result,
 * read_page, compact_history and read_code are the call protocol itself and always offered. */
export declare const WITHHOLDABLE_TOOLS: readonly string[];
/**
 * `.nl` frontmatter. `args`, `types`, `generic` and `returns` hold TypeScript type text, read verbatim rather than as YAML, so types
 * need no quoting: `names: string[]`, `rows: { title: string }[]`, `f: (x: string) => number`. A value wrapped entirely
 * in quotes is the quoted text, as in YAML. The other keys are YAML.
 */
export declare function readNatlangFrontmatter(source: string): Record<string, unknown>;
/** Parse a `.nl` file. */
export declare function parseNatlang(path: string, text: string, inherited: Record<string, string>, files: SourceFiles): NatlangRecord;
/**
 * The sources a `protect:` list names, from the source of the function that declares it: each entry is a path from that
 * function's companion folder (`review.nl` with `protect: [checks/citations.ts]` names `review/checks/citations.ts`).
 * The extension is dropped, so an entry names a `.nl`, `.ts` or `.js` item, or a whole subfolder.
 */
export declare function protectedSources(source: string, entries: readonly string[] | undefined): string[];
/** Whether an item at `source` is one of `protectedList` (protectedSources) or inside a protected folder. */
export declare function isProtectedSource(source: string, protectedList: readonly string[]): boolean;
/**
 * Everything one function's frontmatter protects: its `protect:` list and the items its `ensures:` checks name (they
 * judge its calls, so a call's edits can never weaken a postcondition), as sources (protectedSources).
 */
export declare function recordProtectedSources(record: Pick<NatlangRecord, 'source' | 'protect' | 'ensures' | 'args' | 'codebase'>): string[];
/** Every source a record tree protects: its natural-language functions' `protect:` lists and `ensures:` checks, resolved. */
export declare function treeProtectedSources(codebase: Record<string, ItemRecord>): string[];
/** The package root above `dir`: the nearest directory with `natlang.json` or `package.json`. */
export declare function packageRoot(dir: string, files: SourceFiles): string;
export declare function usesTargetsOf(record: NatlangRecord): Readonly<Record<string, string>> | undefined;
/** Shared source resolution for runtime module loading and explicit compiler import closure. */
export declare function resolveImportedSource(specifier: string, from: string, files: SourceFiles): string | undefined;
/** Parse a TypeScript (or constrained JavaScript) module in a callable folder: its exports, imports, and type aliases. */
export declare function parseModule(path: string, text: string, inherited: Record<string, string>, files: SourceFiles, options?: {
    allowUntypedExports?: boolean;
    compiled?: boolean;
}): ModuleRecord;
/** Load a callable folder into a record tree. `inherited` holds type aliases from enclosing folders. */
export declare function loadCallableFolder(dir: string, files: SourceFiles, inherited?: Record<string, string>): Record<string, ItemRecord>;
/** Load a named `.nl` function with its companion folder as its callable context. */
export declare function loadNamedFunction(path: string, files: SourceFiles): NatlangRecord;
/** Find the nearest ancestor directory (including `start`) that contains `natlang.d/`. */
export declare function findApplicationContext(start: string, files: SourceFiles): string | undefined;
/** Path operations with no file access, for reparsing an edited source by its path. */
export declare const PATH_ONLY: SourceFiles;
