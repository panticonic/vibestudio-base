import { type NatlangCallable } from './callable.js';
import type { Platform } from './platform.js';
import { type ItemRecord, type SourceFiles } from './loader.js';
/** Node source access; display paths are relative to `root`. */
export declare function nodeSourceFiles(root?: string): SourceFiles;
/**
 * Load a named `.nl` function (with its companion folder) as a callable.
 *
 * `live`: the callable follows its sources. Each call first checks the files and folders the loader read (the
 * function, its owners, its companion folder, their types) and loads them again when one changed, so a long-running
 * process uses the newest definition from its next call on; a call that started keeps the definition it started with.
 * When the changed sources do not load, calls keep the last definition that loaded and the error is reported once.
 */
export declare function loadNatlang(path: string, root?: string, options?: {
    live?: boolean;
    platform?: Platform;
}): NatlangCallable;
/** Load a callable folder (for example `natlang.d/`) as a record of callables. */
export declare function loadCallables(dir: string, root?: string, platform?: Platform): Record<string, unknown>;
/** The record tree of the `natlang.d/` context that applies to `start`, if any. */
export declare function applicationContextRecords(start: string, root?: string): {
    dir: string;
    records: Record<string, ItemRecord>;
} | undefined;
/** A trace sink writing one JSONL file per natlang invocation into `dir`. */
export declare function fileTraceSink(dir: string): import('./runtime.js').TraceSink;
