import { Folder } from './scoped-fs.js';
import type { PythonWatchdog } from './python-watchdog.js';
/** What a Python cell can reach: the platform's watchdog for its timeout, and `nl` and `iterateOn` over the calling task. */
export type PythonHost = {
    watchdog?: PythonWatchdog;
    nl?: (instructions: string, returns: string) => (...args: unknown[]) => Promise<unknown>;
    iterateOn?: (step: unknown, initial: unknown, ...fixed: unknown[]) => unknown;
};
export type PythonResult = {
    value: unknown;
    stdout: string;
    stderr: string;
    changedPaths: string[];
};
/** Run a policy-checked cell. Calls share an interpreter but keep separate folders and Python globals. */
export declare function runFolderPython(folder: Folder, source: string, host?: PythonHost, timeoutMs?: number): Promise<PythonResult>;
