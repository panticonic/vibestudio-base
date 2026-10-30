import { type LocalModelRelease } from '../model-catalog.js';
import { type LocalServerSettings, type SlotPlan } from './slots.js';
import type { LlamaHost } from './host.js';
/** Where a stock model is downloaded to (the checkout's models/ directory is used first when it holds the file). */
export declare function stockModelPath(host: LlamaHost, release: LocalModelRelease): string;
export declare function localModelPrerequisites(host: LlamaHost, release?: LocalModelRelease): {
    executable: string | null;
    available: boolean;
    command: string;
    runtime: import("./runtime.js").LlamaRuntimeDiscovery;
    model: string;
    modelPath: string | null;
    template: string | null;
    downloadable: boolean;
    downloadBytes: number | null;
};
/** The slot count a managed local server would start with, and why (`natlang doctor`). */
export declare function localSlotPlan(host: LlamaHost, local: LocalServerSettings | undefined, modelPath?: string | null, release?: LocalModelRelease): SlotPlan;
/**
 * The sha256 of the base GGUF the managed server runs: the pinned default's declared hash, or the configured file's
 * content hash (cached beside it by size and mtime). Tuned GGUF adapters must bind exactly this file.
 */
export declare function managedModelSha256(host: LlamaHost, release?: LocalModelRelease): Promise<string>;
/** The download of `release` another live process is writing now (its `.partial-<pid>` file), if any. */
export declare function stockModelDownload(host: LlamaHost, release: LocalModelRelease): {
    received: number;
    total: number;
    pid: number;
} | null;
/** The stock model's verified local file, downloaded first when absent (with progress on the host's log). A download
 * another process is already making is awaited instead of repeated. */
export declare function ensureStockModel(host: LlamaHost, release: LocalModelRelease, onProgress?: (received: number, total: number) => void): Promise<string>;
/** The GGUF to serve: the configured file (`NATLANG_MODEL_PATH`), or the stock model, downloaded first when absent. */
export declare function ensureModel(host: LlamaHost, release: LocalModelRelease): Promise<string>;
/** The chat template file to pass, or null for a configured GGUF without one (it is served with its own). */
export declare function templatePath(host: LlamaHost, release: LocalModelRelease): string | null;
/** A llama.cpp binary's identity as `b<build>g<commit>`: the build number alone does not tell fork commits apart. */
export declare const runtimeLabel: (runtime: {
    build: number | null;
    commit: string | null;
} | null | undefined) => string;
/**
 * The key part of a warm state for this model file, llama.cpp build and slot layout: a saved slot state restores only
 * into a server with the same number of slots and context per slot.
 */
export declare const warmTag: (modelSha256: string, runtime: string, plan: Pick<SlotPlan, "slots" | "contextPerSlot">) => string;
