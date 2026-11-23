/**
 * The Node binding of llama/runtime.ts for the CLI and `@natlang/node`: the same functions over the environment, with the
 * platform's directories, `child_process`, global `fetch` and stderr (`nodeLlamaHost`). Hosts with their own supervisor use
 * `@natlang/node/llama`.
 */
import * as llama from '../llama/runtime.js';
import type { LlamaRuntimeRelease } from '../llama/runtime.js';
export type { LlamaRuntimeArtifact, LlamaRuntimeRelease, LlamaServerInspection, LlamaRuntimeDiscovery } from '../llama/runtime.js';
export { LLAMA_RUNTIME_RELEASE, LLAMA_FORK_SOURCE, isCompatibleLlamaVersion, describeLlamaRuntime } from '../llama/runtime.js';
export { defaultNatlangRuntimeDirectory } from '../llama/node.js';
export declare const inspectLlamaServer: (path: string, source: llama.LlamaServerInspection["source"], release?: LlamaRuntimeRelease, environment?: NodeJS.ProcessEnv) => llama.LlamaServerInspection;
export declare const discoverLlamaRuntime: (environment?: NodeJS.ProcessEnv, release?: LlamaRuntimeRelease) => llama.LlamaRuntimeDiscovery;
export declare const installManagedLlamaRuntime: (options?: {
    environment?: NodeJS.ProcessEnv;
    release?: LlamaRuntimeRelease;
    error?: NodeJS.WritableStream;
}) => Promise<llama.LlamaServerInspection>;
export declare const buildForkLlamaRuntime: (options?: {
    environment?: NodeJS.ProcessEnv;
    error?: NodeJS.WritableStream;
    cuda?: boolean;
    jobs?: number;
}) => Promise<llama.LlamaServerInspection>;
