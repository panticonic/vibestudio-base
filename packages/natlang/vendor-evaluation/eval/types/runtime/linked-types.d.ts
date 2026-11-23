import type { SourceFiles } from './loader.js';
/** Resolve portable types in their declaring module before flattening them for Natlang's type environment. */
export declare function readTypesFile(path: string, files: SourceFiles): Record<string, string>;
