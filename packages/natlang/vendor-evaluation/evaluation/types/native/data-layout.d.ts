import { Folder, type FolderAccess } from './scoped-fs.js';
export type FolderDataLayout = {
    /** The unique record key. */
    id: string;
    /** A relative path template such as `emails/{group}/{id}.md`. */
    path?: string;
    /** `frontmatter` preserves typed fields and free text; `json` and `text` are also supported. */
    format?: 'frontmatter' | 'json' | 'text';
    /** Field containing the free-text body. Defaults to `body`. */
    body?: string;
    /** An optional deterministic field appended when id values are duplicated. */
    disambiguation?: string;
    /** The one writable representation. Defaults to per-record files. */
    writable?: 'records' | 'table';
    /** CSV path: a regenerated view for records, or the writable source in table mode. */
    table?: string;
};
export type FolderDataResult = {
    records: Record<string, unknown>[];
    deleted: string[];
    unknown: string[];
    /** Non-record files written by a reducer, such as a report. */
    outputs: Record<string, string>;
};
/** Build a folder from records without asking callers to serialize files themselves. */
export declare function folderFromData(records: Record<string, unknown>[], layout: FolderDataLayout, access?: FolderAccess): Folder;
/** Recover edited records by embedded identity; moves become updated path fields. */
export declare function folderToData(folder: Folder, layout?: FolderDataLayout): Promise<FolderDataResult>;
