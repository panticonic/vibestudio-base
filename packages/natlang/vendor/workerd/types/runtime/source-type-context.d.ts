export type SourceTypeExports = Record<string, Record<string, string>>;
/** Pure frontend data, never executable records, service values or module state. */
export type SourceTypeContext = {
    schema: 'natlang.source-types/1';
    root: string;
    sourceDigest: string;
    compilerOptions: Record<string, unknown>;
    compilerDigest: string;
    modules: SourceTypeExports;
    modulesDigest: string;
};
export declare function sourceTypeReuseEnabled(): boolean;
export declare function sourceTypeContext(files: Record<string, string>, root: string, compilerOptions: Record<string, unknown>, modules: SourceTypeExports): SourceTypeContext;
/** Match exact immutable source/mount/SKILL bytes, lexical root, compiler options and alias data. */
export declare function sourceTypeContextMatches(context: SourceTypeContext | undefined, files: Record<string, string>, root: string, compilerOptions?: Record<string, unknown>): boolean;
