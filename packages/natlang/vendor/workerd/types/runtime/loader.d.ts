import { type GenericResult } from '../native/representation.js';
export type SourceFiles = {
    join(...parts: string[]): string;
    dirname(path: string): string;
    basename(path: string, extension?: string): string;
    extname(path: string): string;
    isFile(path: string): boolean;
    isDirectory(path: string): boolean;
    read(path: string): string;
    list(path: string): string[];
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
    /** `readout: decision` in the frontmatter: answer by scoring the finite result values (native/decision.ts). */
    readout?: 'decision' | 'template';
    /** `model: NAME` in the frontmatter: the call runs on the runtime's model of that name (`models`), else the default. */
    model?: string;
    /**
     * `uses: [dir/item]` in the frontmatter: package items this function may call besides its companion folder, by path
     * from the package root. Each is in `codebase` under its base name.
     */
    uses?: string[];
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
export declare class NatlangSourceError extends Error {
    readonly path: string;
    constructor(path: string, message: string);
}
export declare const nodeKey: (record: NatlangRecord | ModuleRecord) => string;
export declare function registerFileRecords(codebase: Record<string, ItemRecord> | ItemRecord): void;
/** Whether an executable node and all its children come from files. */
export declare function isFileRecord(record: ItemRecord): boolean;
/**
 * `.nl` frontmatter. `args`, `types`, `generic` and `returns` hold TypeScript type text, read verbatim rather than as YAML, so types
 * need no quoting: `names: string[]`, `rows: { title: string }[]`, `f: (x: string) => number`. A value wrapped entirely
 * in quotes is the quoted text, as in YAML. The other keys are YAML.
 */
export declare function readNatlangFrontmatter(source: string): Record<string, unknown>;
/** Parse a `.nl` file. */
export declare function parseNatlang(path: string, text: string, inherited: Record<string, string>, files: SourceFiles): NatlangRecord;
/** Parse a TypeScript module in a callable folder: its exports, imports, and type aliases. */
export declare function parseModule(path: string, text: string, inherited: Record<string, string>, files: SourceFiles): ModuleRecord;
/**
 * The type aliases of a `types.ts`, including those it re-exports from another types module with
 * `export type { A, B } from "../other/types.js"` or `export * from "./more.js"`. Two applications share one definition
 * that way instead of declaring it twice. Only relative specifiers that name a readable file are followed.
 */
export declare function readTypesFile(path: string, files: SourceFiles, seen?: string[]): Record<string, string>;
/** Load a callable folder into a record tree. `inherited` holds type aliases from enclosing folders. */
export declare function loadCallableFolder(dir: string, files: SourceFiles, inherited?: Record<string, string>): Record<string, ItemRecord>;
/** Load a named `.nl` function with its companion folder as its callable context. */
export declare function loadNamedFunction(path: string, files: SourceFiles): NatlangRecord;
/** Find the nearest ancestor directory (including `start`) that contains `natlang.d/`. */
export declare function findApplicationContext(start: string, files: SourceFiles): string | undefined;
/** Path operations with no file access, for reparsing an edited source by its path. */
export declare const PATH_ONLY: SourceFiles;
