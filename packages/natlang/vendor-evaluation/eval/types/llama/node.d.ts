import type { LlamaDirectories, LlamaHost, LlamaLog, LlamaProcesses } from './host.js';
export declare function defaultNatlangRuntimeDirectory(environment?: NodeJS.ProcessEnv): string;
export declare const nodeLlamaProcesses: LlamaProcesses;
/** The CLI's directories: the platform's natlang cache, state and runtime roots, and the checkout's or package's model files. */
export declare function nodeLlamaDirectories(environment?: NodeJS.ProcessEnv): LlamaDirectories;
/** The host the natlang CLI passes: Node processes and directories, global `fetch`, and `log` (default stderr) for notices. */
export declare function nodeLlamaHost(environment?: NodeJS.ProcessEnv, log?: LlamaLog): LlamaHost;
