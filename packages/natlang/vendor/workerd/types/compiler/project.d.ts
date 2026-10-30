import { type RefinedSlot } from './refined-slots.js';
import { RewriteGate, type RewriteRecord } from './rewrites.js';
import type { ProgramDescriptor } from '../adaptation/types.js';
import { spanOf, type NatlangDiagnostic } from './inline.js';
import { NATLANG_COMPILE_VERSION } from './intrinsics.js';
import { type NatlangRecord } from '../runtime/loader.js';
import { NEUTRAL_RUNTIME_SPECIFIER } from './runtime-specifier.js';
/** File access for the project compiler: the real filesystem on Node, virtual files in browsers. */
export interface ProjectFiles {
    isFile(path: string): boolean;
    isDirectory(path: string): boolean;
    list(dir: string): string[];
    read(path: string): string;
    /** Binary reads, for `.nz` files. */
    readBytes?(path: string): Uint8Array;
    write?(path: string, text: string): void;
    /** Underlying compiler access for libraries and dependencies (Node: ts.sys). */
    compiler?: import('./host.js').CompilerFiles;
}
export { NEUTRAL_RUNTIME_SPECIFIER };
export type BuildOptions = {
    /** Enforce the finite generated-program profile on every editable application module. */
    constrained?: boolean;
    services?: ProgramDescriptor['services'];
    programId?: string;
    guidance?: string;
    importedGuidancePrograms?: readonly string[];
    /** Project directory or tsconfig path (absolute POSIX path when `files` is supplied). */
    project: string;
    /** File access; defaults to the Node filesystem (see `buildProject` in compiler/node-project.ts). */
    files: ProjectFiles;
    /** Emitted module format; browsers executing a virtual project use `commonjs`. */
    module?: 'esm' | 'commonjs';
    outDir?: string;
    target?: 'node' | 'browser';
    /** Specifier of the runtime package the emitted code imports (default: the one files import `nl` from). */
    runtimeSpecifier?: string;
    /** Write `.d.nl.ts` declarations and emitted JavaScript. */
    write?: boolean;
    /** Emit JavaScript (build) or only check. */
    emit?: boolean;
    /** Write generated `.d.nl.ts` files beside their sources (default true; read-only installed packages use false). */
    writeDeclarations?: boolean;
    /**
     * Bind the project to a specific runtime module: these specifiers type-check against `types` and are
     * emitted as `url`, so the compiled app shares one runtime instance with its launcher. The neutral specifier
     * (`NEUTRAL_RUNTIME_SPECIFIER`) is always bound with them.
     */
    runtimeModule?: {
        specifiers: string[];
        url: string;
        types: string;
        path?: string;
    };
    /** Type these runtime specifiers, and the neutral one, against the built-in surface declarations (virtual projects). */
    surfaceSpecifiers?: string[];
    /** Type-check these specifiers against a runtime's declaration file when the project cannot resolve them. */
    runtimeTypes?: {
        specifiers: string[];
        types: string;
    };
    /** Type roots shipped with the runtime (Node's `@types`), used for `types` entries the project cannot resolve. */
    runtimeTypeRoots?: string[];
    /**
     * Law-based combinator rewrites (spec/NEURALESE_REWRITES.md) applied to emitted code that imports `natlang:neuralese`.
     * Without a gate, or with no recorded measurement for the current model and dialect, no rule fires.
     */
    rewriteGate?: RewriteGate;
};
export type DefinitionManifest = {
    version: typeof NATLANG_COMPILE_VERSION;
    inline: {
        id: string;
        source: string;
        line: number;
        signature: string;
    }[];
    named: {
        id: string;
        source: string;
        signature: string;
    }[];
    sites: string[];
    adaptation?: ProgramDescriptor;
};
export type BuildResult = {
    ok: boolean;
    diagnostics: NatlangDiagnostic[];
    outputs: Record<string, string>;
    declarations: Record<string, string>;
    manifest: DefinitionManifest;
    outDir: string;
    /** Rewrites applied per emitted file (empty until a rule is enabled). */
    rewrites?: Record<string, RewriteRecord[]>;
    /** Every `Is<T, "predicate">` slot of the named and inline functions and the predicate the runtime will check there. */
    refinedSlots?: RefinedSlot[];
};
/** Generated declaration for `foo.nl`, read by TypeScript as `foo.d.nl.ts`. */
export declare function natlangDeclaration(record: NatlangRecord, runtimeSpecifier: string): string;
/** Check and optionally compile a project. File access comes from `options.files`. */
export declare function compileProject(options: BuildOptions): BuildResult;
/** Format diagnostics for a terminal. */
export declare function formatDiagnostics(diagnostics: readonly NatlangDiagnostic[]): string;
export { spanOf };
