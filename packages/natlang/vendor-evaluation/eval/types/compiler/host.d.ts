import ts from 'typescript';
/** Minimal file access the compiler needs. Node supplies `ts.sys`; browsers supply virtual files. */
export interface CompilerFiles {
    readFile(path: string): string | undefined;
    fileExists(path: string): boolean;
    directoryExists?(path: string): boolean;
    getDirectories?(path: string): string[];
    realpath?(path: string): string;
    readDirectory?(path: string, extensions?: readonly string[], excludes?: readonly string[], includes?: readonly string[], depth?: number): string[];
}
/** Returns declaration text for a TypeScript library file such as `lib.es2022.d.ts`. */
export type LibProvider = (fileName: string) => string | undefined;
export type NatlangCompilerHostOptions = {
    options: ts.CompilerOptions;
    /** Absolute POSIX paths overlaid on the underlying files. */
    virtual?: ReadonlyMap<string, string>;
    files?: CompilerFiles;
    libs?: LibProvider;
    /** Read `nl` called on literal instructions as the tag form (default true; a host that resolves symbols itself,
     * compiler/host-cell.ts, rewrites only the built-in `nl` and passes false). */
    desugarNl?: boolean;
    currentDirectory?: string;
};
/** A compiler host over real or virtual files, always including the natlang intrinsics. */
export declare function createNatlangCompilerHost(config: NatlangCompilerHostOptions): ts.CompilerHost;
/** Compiler options for eval snippets and small virtual programs. */
export declare const EVAL_COMPILER_OPTIONS: ts.CompilerOptions;
/** Build a checked program over in-memory files (absolute POSIX paths). */
export declare function createVirtualProgram(files: Record<string, string>, options?: ts.CompilerOptions, roots?: string[], base?: CompilerFiles): ts.Program;
