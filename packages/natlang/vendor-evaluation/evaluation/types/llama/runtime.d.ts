import type { LlamaHost } from './host.js';
export type LlamaRuntimeArtifact = {
    key: string;
    platform: NodeJS.Platform;
    arch: string;
    backend: 'cpu' | 'metal';
    archive: 'tar.gz' | 'zip';
    url: string;
    bytes: number;
    sha256: string;
};
export type LlamaRuntimeRelease = {
    version: string;
    build: number;
    commit: string;
    compatible: {
        minimumVersion: string;
        maximumVersionExclusive: string;
        minimumBuild: number;
    };
    artifacts: readonly LlamaRuntimeArtifact[];
};
export type LlamaServerInspection = {
    path: string;
    source: 'explicit' | 'managed' | 'fork' | 'path';
    compatible: boolean;
    version: string | null;
    build: number | null;
    commit: string | null;
    reason: string | null;
    output: string;
};
export type LlamaRuntimeDiscovery = {
    selected: LlamaServerInspection | null;
    candidates: LlamaServerInspection[];
    artifact: LlamaRuntimeArtifact | null;
    runtimeRoot: string;
};
export { LLAMA_RUNTIME_RELEASE } from '../llama-runtime-release.js';
export { LLAMA_FORK_SOURCE } from '../llama-fork-source.js';
export declare function isCompatibleLlamaVersion(version: string, build: number, release?: LlamaRuntimeRelease): boolean;
export declare function inspectLlamaServer(host: LlamaHost, path: string, source: LlamaServerInspection['source'], release?: LlamaRuntimeRelease): LlamaServerInspection;
/**
 * `natlang runtime build`: fetch the pinned commit of natlang's llama.cpp fork and compile llama-server for this machine
 * (native CPU flags; CUDA when nvcc is found or `cuda` is set; Metal on macOS) into the runtime directory, where
 * discovery prefers it. Needs git, CMake and a C++ compiler.
 */
export declare function buildForkLlamaRuntime(host: LlamaHost, options?: {
    cuda?: boolean;
    jobs?: number;
}): Promise<LlamaServerInspection>;
export declare function discoverLlamaRuntime(host: LlamaHost, release?: LlamaRuntimeRelease): LlamaRuntimeDiscovery;
export declare function installManagedLlamaRuntime(host: LlamaHost, options?: {
    release?: LlamaRuntimeRelease;
}): Promise<LlamaServerInspection>;
export declare function describeLlamaRuntime(discovery: LlamaRuntimeDiscovery): string;
