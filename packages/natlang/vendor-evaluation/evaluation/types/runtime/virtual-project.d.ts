import { type SourceTypeContext } from './source-type-context.js';
/**
 * Compile and execute a project held in memory (browser playground, Studio workers, tests).
 * The project compiles to CommonJS and runs through a small module loader in this realm, so it
 * shares the calling runtime instance.
 */
import { type BuildResult, type ProjectFiles } from '../compiler/project.js';
import { type SourceFiles } from './loader.js';
import { type NatlangCallable } from './callable.js';
import type { Platform } from './platform.js';
import type { ProgramDescriptor } from '../adaptation/types.js';
export type VirtualProject = {
    files: Record<string, string>;
    root?: string;
};
/** In-memory project files (absolute POSIX paths). */
export declare function virtualProjectFiles(files: Record<string, string>, root?: string): ProjectFiles & {
    outputs: Map<string, string>;
};
/** Loader access to in-memory files; display paths are relative to `root`. */
export declare function virtualSourceFiles(files: Record<string, string>, root?: string, sourceTypes?: SourceTypeContext): SourceFiles;
/** Load a named `.nl` function, with its companion folder, from in-memory files; its TypeScript modules run on `platform`. */
export declare function loadVirtualNatlang(files: Record<string, string>, path: string, root?: string, platform?: Platform, sourceTypes?: SourceTypeContext): NatlangCallable;
/** Load an in-memory directory as a callable folder: its `.nl` and `.ts` items as a record of callables. */
export declare function loadVirtualCallables(files: Record<string, string>, dir?: string, root?: string, platform?: Platform, sourceTypes?: SourceTypeContext): Record<string, unknown>;
export type CompiledProject = BuildResult & {
    require(path: string): Record<string, unknown>;
    sourceTypes?: SourceTypeContext;
};
export type VirtualProjectOptions = {
    inlineRecords?: boolean;
    platform: Platform;
    constrained?: boolean;
    programId?: string;
    guidance?: string;
    importedGuidancePrograms?: readonly string[];
    services?: ProgramDescriptor['services'];
    runtimeSpecifiers?: string[];
    target?: 'node' | 'browser';
    modules?: Record<string, unknown>;
    /** Validate source and produce declarations without emitting JavaScript. */
    emit?: boolean;
    /** Return generated declaration documents (default true); type checking is unchanged. */
    declarations?: boolean;
    /** Collect the program descriptor for adaptation. Defaults to true. */
    adaptation?: boolean;
    reuseSourceTypes?: boolean;
};
/**
 * Compile a virtual project and return a loader for its modules. `runtime` is the namespace that
 * `@natlang/browser` (and any `runtimeSpecifiers`) resolve to inside the project. The modules run in `platform`'s
 * module realm (the Function constructor, a vm, a host's confined realm) and resolve its platform modules.
 *
 * Compiled code refers to the runtime only through `require(specifier)` for the specifiers in `runtimeSpecifiers`
 * (default `@natlang/browser`, `@natlang/node`) and the neutral `NEUTRAL_RUNTIME_SPECIFIER`; the loader answers those
 * with `runtime`, so a host binds the project to its one runtime instance by passing it here. `target` says whether
 * awaits restore the natlang task (`browser`); by default the platform's context store decides.
 */
/** A serializable frontend product. It contains no runtime, service, realm or module instance. */
export type VirtualProjectProduct = {
    schema: 'natlang.virtual-project-product/1';
    project: VirtualProject;
    runtimeSpecifiers: string[];
    build: BuildResult;
    sourceTypes?: SourceTypeContext;
};
export type VirtualProjectProductOptions = Omit<VirtualProjectOptions, 'platform' | 'modules' | 'target'> & {
    /** Explicit: a compiler worker has no runtime platform from which to infer this. */
    target: 'node' | 'browser';
};
/** Pure frontend compilation, suitable for an isolated worker and an exact-input shared cache. */
export declare function compileVirtualProjectProduct(project: VirtualProject, options: VirtualProjectProductOptions): VirtualProjectProduct;
/** Bind a reusable frontend product to this owner's runtime and fresh module/realm state. */
export declare function instantiateVirtualProjectProduct(product: VirtualProjectProduct, runtime: Record<string, unknown>, options: Pick<VirtualProjectOptions, 'platform' | 'modules'>): CompiledProject;
/** Default local composition; hosts can offload only the pure first stage. */
export declare function compileVirtualProject(project: VirtualProject, runtime: Record<string, unknown>, options: VirtualProjectOptions): CompiledProject;
