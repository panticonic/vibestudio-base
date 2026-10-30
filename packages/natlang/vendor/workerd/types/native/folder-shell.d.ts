/** Bash over the same Folder overlay used by file tools and reducers. */
import { type IFileSystem, type FsStat, type FileContent, type BufferEncoding, type RmOptions, type CpOptions, type MkdirOptions } from 'just-bash';
import { Folder } from './scoped-fs.js';
import { type PythonHost } from './folder-python.js';
import { type AskHost, type CallHost } from './natlang-command.js';
/** A lazy filesystem adapter: stat and directory traversal use metadata, not file contents. */
export declare class FolderFs implements IFileSystem {
    readonly folder: Folder;
    private readonly emptyDirs;
    constructor(folder: Folder);
    resolvePath(base: string, path: string): string;
    private relative;
    private kind;
    readFileBuffer(path: string): Promise<Uint8Array>;
    readFile(path: string, options?: {
        encoding?: BufferEncoding | null;
    } | BufferEncoding): Promise<string>;
    writeFile(path: string, content: FileContent, _options?: {
        encoding?: BufferEncoding;
    } | BufferEncoding): Promise<void>;
    appendFile(path: string, content: FileContent, options?: {
        encoding?: BufferEncoding;
    } | BufferEncoding): Promise<void>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<FsStat>;
    lstat(path: string): Promise<FsStat>;
    mkdir(path: string, options?: MkdirOptions): Promise<void>;
    readdir(path: string): Promise<string[]>;
    readdirWithFileTypes(path: string): Promise<{
        name: string;
        isFile: boolean;
        isDirectory: boolean;
        isSymbolicLink: boolean;
    }[]>;
    rm(path: string, options?: RmOptions): Promise<void>;
    cp(src: string, dest: string, options?: CpOptions): Promise<void>;
    mv(src: string, dest: string): Promise<void>;
    getAllPaths(): string[];
    chmod(path: string): Promise<void>;
    symlink(): Promise<void>;
    link(): Promise<void>;
    readlink(): Promise<string>;
    realpath(path: string): Promise<string>;
    utimes(path: string): Promise<void>;
}
/** Refuse open-ended shell loops and function recursion before any command runs. */
export declare function checkBashPolicy(command: string): void;
export type FolderBashResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
    changedPaths: string[];
};
export type FolderBashOptions = {
    network?: boolean;
    python?: PythonHost;
    ask?: AskHost;
    call?: CallHost;
    apply?: (name: string, path: string) => Promise<unknown>;
    /** The directory the command starts in: absolute under /workspace, or relative to it (default /workspace). */
    cwd?: string;
    /** Environment variables for this command, over the shell's own. */
    env?: Record<string, string>;
    /** Stops the command at its next statement boundary. */
    signal?: AbortSignal;
    /** Arguments appended to the first command as they are, without shell parsing (an argv run as `command`, `args`). */
    args?: string[];
};
export declare function runFolderBash(folder: Folder, command: string, options?: FolderBashOptions): Promise<FolderBashResult>;
