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
export declare function virtualSourceFiles(files: Record<string, string>, root?: string): SourceFiles;
/** Load a named `.nl` function, with its companion folder, from in-memory files; its TypeScript modules run on `platform`. */
export declare function loadVirtualNatlang(files: Record<string, string>, path: string, root?: string, platform?: Platform): NatlangCallable;
/** Load an in-memory directory as a callable folder: its `.nl` and `.ts` items as a record of callables. */
export declare function loadVirtualCallables(files: Record<string, string>, dir?: string, root?: string, platform?: Platform): Record<string, unknown>;
export type CompiledProject = BuildResult & {
    require(path: string): Record<string, unknown>;
};
export type VirtualProjectOptions = {
    platform: Platform;
    constrained?: boolean;
    programId?: string;
    guidance?: string;
    importedGuidancePrograms?: readonly string[];
    services?: ProgramDescriptor['services'];
    runtimeSpecifiers?: string[];
    target?: 'node' | 'browser';
    modules?: Record<string, unknown>;
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
export declare function compileVirtualProject(project: VirtualProject, runtime: Record<string, unknown>, options: VirtualProjectOptions): CompiledProject;
