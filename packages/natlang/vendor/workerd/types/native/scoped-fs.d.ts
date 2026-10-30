/** Standalone copy-on-write folder handles for scoped lambda filesystems. */
import { FolderIteration } from '../runtime/folder-iteration.js';
import { type FolderDataLayout } from './data-layout.js';
export type FolderAccess = 'read' | 'write' | 'overlay';
export type FileContents = string | Uint8Array;
type WriteFence = {
    path: string | null;
    displayPrefix: string;
};
export type EntryKind = 'file' | 'folder';
export type EntryStat = {
    path: string;
    kind: EntryKind;
    bytes: number;
    digest: string | null;
};
/** What list_files shows the model: one `path  N bytes` line per file. */
export declare function fileListingText(entries: EntryStat[]): string;
export type SearchMatch = {
    path: string;
    line: number;
    text: string;
};
export type ChangeKind = 'added' | 'modified' | 'deleted';
export type Change = {
    path: string;
    kind: ChangeKind;
    before?: Uint8Array;
    after?: Uint8Array;
};
export type ChangeSet = {
    changes: Change[];
    moves: Array<[string, string]>;
};
export declare class FolderBusyError extends Error {
    constructor();
}
export declare class FolderConflictError extends Error {
    constructor(path: string);
}
export declare class FolderScopeError extends Error {
    constructor(path: string);
}
/** A subtree writer lock. Disjoint directories may run and commit together. */
export declare class WriterLock {
    private readonly held;
    private waiters;
    acquire(blocking?: boolean, path?: string): Promise<() => void>;
    release(path?: string): void;
}
/**
 * A function that can run as a directory reducer on a folder exposes this method. `folder.apply(reducer, ...args)`
 * runs it with a private copy of the folder and installs its committed changes.
 */
export declare const APPLY_TO_FOLDER: unique symbol;
export type FolderReducer = {
    [APPLY_TO_FOLDER]?: (folder: FolderHandle, args: unknown[]) => Promise<unknown>;
};
/** Replace exactly one span of `text`; `fuzzy` matches one whole line ignoring whitespace differences. */
export declare function editTextContent(text: string, find: string, replaceWith: string, fuzzy?: boolean): string;
export declare class EntryHandle {
    readonly path: string;
    readonly folder: Folder;
    constructor(folder: Folder, path: string);
    get name(): string;
    get relativePath(): string;
    get parent(): FolderHandle | null;
    exists(): Promise<boolean>;
    stat(): Promise<EntryStat>;
    remove(): Promise<void>;
    /** Move like `mv`: into a folder handle, into a path ending in "/" or naming an existing folder, else to that path. */
    moveTo(destination: FolderHandle | FileHandle | string): Promise<void>;
}
export declare class FileHandle extends EntryHandle {
    readText(startLine?: number, endLine?: number): Promise<string>;
    readBytes(): Promise<Uint8Array>;
    readJson<T = unknown>(): Promise<T>;
    writeText(content: string): Promise<void>;
    writeBytes(content: Uint8Array): Promise<void>;
    writeJson(value: unknown): Promise<void>;
    editText(find: string, replaceWith: string, fuzzy?: boolean): Promise<Record<string, unknown>>;
}
export declare class FolderHandle extends EntryHandle {
    dir(path: string): FolderHandle;
    file(path: string): FileHandle;
    entry(path: string): EntryHandle;
    /** Handle globs are relative to this subtree, as file() and dir() paths are. */
    private scopedPattern;
    entries(patternText?: string): Promise<EntryHandle[]>;
    files(patternText?: string): Promise<FileHandle[]>;
    folders(patternText?: string): Promise<FolderHandle[]>;
    walk(patternText?: string): AsyncIterable<EntryHandle>;
    snapshot(): FolderSnapshot;
    at(sourceId: string): FolderSnapshot;
    propose<A extends unknown[], R>(reducer: (folder: any, ...args: A) => Promise<R>, ...args: A): Promise<FolderProposal<R>>;
    propose<R = unknown>(reducer: unknown, ...args: unknown[]): Promise<FolderProposal<R>>;
    accept<R>(proposal: FolderProposal<R>): Promise<FolderSnapshot>;
    select(snapshot: FolderSnapshot): Promise<void>;
    iterateOn<S>(reducer: unknown, initial: S, ...args: unknown[]): FolderIteration<S>;
    diff(): Promise<ChangeSet>;
    beginTransaction(blocking?: boolean): Promise<FolderTransaction>;
    /** Run a directory reducer on this folder and install its committed changes; resolves to its typed result. */
    apply<A extends unknown[], R>(reducer: (folder: any, ...args: A) => Promise<R>, ...args: A): Promise<R>;
    apply(reducer: unknown, ...args: unknown[]): Promise<unknown>;
}
export declare class FolderTransaction {
    readonly parent: Folder;
    readonly folder: Folder;
    readonly prefix: string;
    private readonly release;
    readonly scopedFile?: string | undefined;
    private closed;
    constructor(parent: Folder, folder: Folder, prefix?: string, release?: () => void, scopedFile?: string | undefined);
    get open(): boolean;
    private ensureOpen;
    private rootedChanges;
    validateSync(include?: string[], exclude?: string[]): void;
    commitSync(include?: string[], exclude?: string[]): ChangeSet;
    commit(include?: string[], exclude?: string[]): Promise<ChangeSet>;
    abort(): void;
    private close;
}
/**
 * The unchanged contents beneath a folder: a list of file paths and a reader. Sources are read lazily,
 * so a folder can front a large directory on disk. Paths are clean relative POSIX paths.
 */
export interface FolderSource {
    paths(): Iterable<string>;
    get(path: string): Uint8Array | undefined;
    size?(path: string): number | undefined;
}
export declare class Folder {
    readonly access: FolderAccess;
    private readonly source;
    private readonly overlay;
    private readonly moves;
    private readonly writerLock;
    private revisionNumber;
    private readonly lineage;
    private readonly scope;
    private readonly computed;
    private readonly writeFence?;
    constructor(files?: Record<string, FileContents> | FolderSource, access?: FolderAccess, options?: {
        writer?: WriterLock;
        computed?: Map<string, (folder: Folder) => Uint8Array>;
        lineage?: object;
        scope?: string;
        writeFence?: WriteFence;
    });
    static fromFiles(files: Record<string, FileContents>, access?: FolderAccess): Folder;
    static fromData(records: Record<string, unknown>[], layout: FolderDataLayout, access?: FolderAccess): Folder;
    root(): FolderHandle;
    registerComputedFile(path: string, render: (folder: Folder) => Uint8Array): void;
    filePaths(): string[];
    dir(path?: string): FolderHandle;
    file(path: string): FileHandle;
    /** Run a directory reducer on the whole folder and install its committed changes. */
    apply<A extends unknown[], R>(reducer: (folder: any, ...args: A) => Promise<R>, ...args: A): Promise<R>;
    apply(reducer: unknown, ...args: unknown[]): Promise<unknown>;
    propose<A extends unknown[], R>(reducer: (folder: any, ...args: A) => Promise<R>, ...args: A): Promise<FolderProposal<R>>;
    propose<R = unknown>(reducer: unknown, ...args: unknown[]): Promise<FolderProposal<R>>;
    accept<R>(proposal: FolderProposal<R>): Promise<FolderSnapshot>;
    select(snapshot: FolderSnapshot): Promise<void>;
    iterateOn<S>(reducer: unknown, initial: S, ...args: unknown[]): FolderIteration<S>;
    /** Retrieve an already materialized immutable revision of this authorized folder. */
    at(sourceId: string, prefix?: string): FolderSnapshot;
    /** Materialize immutable bytes: disk-backed sources cannot change this checkpoint afterwards. */
    snapshot(prefix?: string): FolderSnapshot;
    proposeAt<R>(path: string, reducer: unknown, args: unknown[]): Promise<FolderProposal<R>>;
    acceptAt<R>(path: string, proposal: FolderProposal<R>): Promise<FolderSnapshot>;
    selectAt(path: string, snapshot: FolderSnapshot): Promise<void>;
    private replaceSnapshot;
    entry(path: string): EntryHandle;
    join(parent: string, child: string): string;
    /** The current contents of one file, or undefined. */
    private current;
    /** Every current file path. */
    private allPaths;
    private checkWrite;
    private checkWritablePath;
    private read;
    exists(path: string): Promise<boolean>;
    isFile(path: string): boolean;
    isFolder(path: string): boolean;
    stat(path: string): Promise<EntryStat>;
    private statSync;
    revision(): number;
    kind(path: string): 'file' | 'dir' | null;
    childNames(path?: string): string[];
    size(path: string): number;
    private paths;
    list(path?: string, patternText?: string): EntryStat[];
    listFiles(path?: string, patternText?: string): EntryStat[];
    listFolders(path?: string, patternText?: string): EntryStat[];
    readBytes(path: string): Promise<Uint8Array>;
    readBytesSync(path: string): Uint8Array;
    readText(path: string, startLine?: number, endLine?: number): Promise<string>;
    readJson<T = unknown>(path: string): Promise<T>;
    writeBytes(path: string, content: FileContents): void;
    writeText(path: string, content: string): void;
    writeJson(path: string, value: unknown): Promise<void>;
    remove(path: string): void;
    move(source: string, destination: string): void;
    editText(path: string, find: string, replaceWith: string, fuzzy?: boolean): Promise<Record<string, unknown>>;
    search(query: string, path?: string, patternText?: string, regex?: boolean): Promise<SearchMatch[]>;
    /** Changes relative to the source; only overlaid paths can differ. */
    diffSync(path?: string): ChangeSet;
    diff(path?: string): Promise<ChangeSet>;
    /** A copy-on-write fork of the current contents, sharing this folder's writer lock. */
    fork(access?: FolderAccess): Folder;
    private snapshotSource;
    writer(): WriterLock;
    beginTransaction(blocking?: boolean, path?: string): Promise<FolderTransaction>;
    /** A one-file capability for a child call. Reads and writes are limited to this file; pass another FileHandle for an output. */
    beginFileTransaction(path: string, blocking?: boolean): Promise<FolderTransaction>;
    installLocked(changes: ChangeSet, include?: string[], exclude?: string[]): ChangeSet;
    validateInstall(changes: ChangeSet): void;
    install(changes: ChangeSet, include?: string[], exclude?: string[], blocking?: boolean): Promise<ChangeSet>;
    installFrom(child: Folder, include?: string[], exclude?: string[], blocking?: boolean): Promise<ChangeSet>;
}
/** Proposals are capabilities, not serializable patches. Only their originating folder may accept them. */
/** Live proposal capability: preserve identity across interpreter eval boundaries. */
export declare class FolderProposal<R = unknown> {
    readonly folder: FolderSnapshot;
    readonly value: R;
    readonly baseRevision: number;
    readonly diff: ChangeSet;
    constructor(folder: FolderSnapshot, value: R, baseRevision: number, diff: ChangeSet);
}
/** Immutable, content-addressed source. Branching preserves target ownership, never shares a writer lock. */
export declare class FolderSnapshot extends Folder {
    readonly digest: string;
    constructor(files: Record<string, FileContents>, lineage?: object, scope?: string);
    branch(): Folder;
    registerComputedFile(): never;
    fork(access?: FolderAccess): Folder;
}
export {};
