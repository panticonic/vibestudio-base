import { type LocalModelRelease } from '../model-catalog.js';
import type { Scheduler } from './scheduler.js';
import type { SlotPlan } from '../llama/slots.js';
import type { WarmPrefix } from '../package/warm.js';
import type { DecisionRequest, DecisionScores, ModelTurn, ModelTurnRequest, SessionTurnOptions } from '../contracts.js';
import type { LlamaRuntimeDiscovery, LlamaServerInspection } from '../llama/runtime.js';
import { type ModelProfile, type ResolvedModelChoice } from './config.js';
export { DEFAULT_LOCAL_MODEL, STOCK_MODELS, stockModel, type LocalModelRelease } from '../model-catalog.js';
export { runtimeLabel, warmTag } from '../llama/models.js';
/**
 * The Node binding of the managed llama.cpp machinery (llama/): the model session the CLI and `@natlang/node` use, and the
 * environment-based entry points over a Node host (`nodeLlamaHost`). Hosts with their own supervisor use `@natlang/node/llama`.
 */
export type { ModelProfile } from './config.js';
export type ManagedModelStatus = {
    source: 'external' | 'managed-local' | 'pi-provider';
    endpoint: string | null;
    model: string;
    executable: string | null;
    modelPath: string | null;
    running: boolean;
    /** A managed server's stock model and llama.cpp build (undefined for other backends and configured GGUFs). */
    release?: LocalModelRelease;
    runtimeBuild?: number | null;
    /** The llama.cpp build and commit, git-describe style (`b12067ga6401bb`): fork builds all report build 1. */
    runtime?: string | null;
    /** The prompt openings this session warmed (prefilled and saved, or restored) on a managed server. */
    warm?: WarmPrefix[];
    /** The session uses a server another process keeps loaded (model/shared-server.ts). */
    shared?: boolean;
};
export type ManagedModelSession = {
    prepare(): Promise<ManagedModelStatus>;
    /** A native reference server's artifact store, for uploading tuned artifacts and states; undefined otherwise. */
    nativeArtifacts?(): import('./neuralese-server.js').HttpNeuraleseStore | undefined;
    /** Requests carry native content parts (native-state imports); wrappers must keep this marker. */
    readonly neuralese?: boolean;
    /** The backend is one of natlang's servers (the native server or the managed llama.cpp fork): it applies guided
     * generation (the `guidance` request field). */
    readonly guidance?: boolean;
    neuraleseRuntime?(): Promise<import('../native/neuralese.js').NeuraleseRuntimeOptions | undefined>;
    vllmStacks?(names: Iterable<string>): void;
    /** One turn; `options` carry the driver's turn options (`onDelta`) and, for a Pi provider backend, `onProgress`. */
    turn(request: ModelTurnRequest, signal?: AbortSignal, options?: SessionTurnOptions): Promise<ModelTurn>;
    /** Score finite replies (decision readout); fails with `decision-unsupported` where the backend cannot. */
    decide(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionScores>;
    /** The model's context window as its server reports it (undefined when it does not say). */
    contextWindow(): Promise<number | undefined>;
    status(): ManagedModelStatus;
    close(): Promise<void>;
    /** The session's model scheduler (undefined for Pi provider backends): queue, batch records and occupancy. */
    scheduler: Scheduler | undefined;
    /** The slot sizing of a managed local server once it has started (null otherwise). */
    slotPlan(): SlotPlan | null;
};
export type ManagedModelRuntimeOptions = {
    ensureRuntime?: (discovery: LlamaRuntimeDiscovery) => Promise<LlamaServerInspection | null>;
    /** Tuned weight adapters (GGUF LoRA exports of the active release) to load at server start, keyed by artifact ID.
     * Each request then applies only its own call's stack through per-request `lora` scales. */
    loraAdapters?: () => readonly {
        readonly id: string;
        readonly path: string;
    }[];
    /** Native state span files (tuned soft states) the managed server loads with `--native-state` (the llama.cpp fork). */
    nativeStates?: () => readonly {
        readonly id: string;
        readonly path: string;
    }[];
    /** Native reference server: request exact sampling receipts (`x_natlang_rl_capture`) on every turn, for RL rollouts. */
    rlCapture?: boolean;
    /** With rlCapture: also record the sampler's top-k log-probs at each sampled position (`x_natlang_rl_top_k`,
     * score-centered RL). */
    rlTopK?: number;
};
/** Where a stock model is downloaded to (the checkout's models/ directory is used first when it holds the file). */
export declare const stockModelPath: (release: LocalModelRelease, environment?: NodeJS.ProcessEnv) => string;
export declare const localModelPrerequisites: (environment?: NodeJS.ProcessEnv, release?: LocalModelRelease) => {
    executable: string | null;
    available: boolean;
    command: string;
    runtime: LlamaRuntimeDiscovery;
    model: string;
    modelPath: string | null;
    template: string | null;
    downloadable: boolean;
    downloadBytes: number | null;
};
/** The slot count a managed local server would start with, and why (`natlang doctor`). */
export declare const localSlotPlan: (local: ModelProfile["local"], environment?: NodeJS.ProcessEnv, modelPath?: string | null, release?: LocalModelRelease) => SlotPlan;
export declare const managedModelSha256: (environment?: NodeJS.ProcessEnv, release?: LocalModelRelease) => Promise<string>;
/** The download of `release` another live process is writing now (its `.partial-<pid>` file), if any. */
export declare const stockModelDownload: (release: LocalModelRelease, environment?: NodeJS.ProcessEnv) => {
    received: number;
    total: number;
    pid: number;
} | null;
/** The stock model's verified local file, downloaded first when absent (with progress on `error`). */
export declare const ensureStockModel: (release: LocalModelRelease, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream, onProgress?: (received: number, total: number) => void) => Promise<string>;
/** Whether a llama-server binary imports native state spans exactly (`--native-state`, the llama.cpp fork). */
export declare const supportsNativeStates: (executable: string, environment?: NodeJS.ProcessEnv) => boolean;
export declare function createManagedModelSession(profile: ModelProfile, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream, runtimeOptions?: ManagedModelRuntimeOptions): ManagedModelSession;
/** The environment a managed local profile runs in: its own GGUF, template and server stand where NATLANG_MODEL_PATH,
 * NATLANG_TEMPLATE and NATLANG_LLAMA_SERVER would; those still override. */
export declare function profileEnvironment(choice: ResolvedModelChoice, environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function createResolvedModelSession(choice: ResolvedModelChoice, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream, runtimeOptions?: ManagedModelRuntimeOptions): ManagedModelSession;
