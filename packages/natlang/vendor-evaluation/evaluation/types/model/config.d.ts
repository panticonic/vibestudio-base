import { type LocalModelRelease } from '../model-catalog.js';
import type { ProgramModel } from '../package/manifest.js';
import type { ModelConfig, NatlangRuntimeOptions } from '../runtime/runtime.js';
import type { LocalServerSettings } from '../llama/slots.js';
import { type NativeModelSettings } from './native-managed.js';
export type BatchingSettings = {
    /** server-continuous (default), explicit-batch or serial. */
    mode?: 'server-continuous' | 'explicit-batch' | 'serial';
    maxConcurrent?: number;
    /** Coalescing window in ms (default 2 for explicit-batch, 0 otherwise). */
    coalesceMs?: number;
    /** Serve turns of running calls before new calls (default true). */
    priority?: boolean;
    /** Optional explicit-batch scoring endpoint: a URL, or true for `{endpoint}/v1/natlang/score`. Explicit-batch mode only. */
    scoreEndpoint?: string | boolean;
};
export type ModelProfile = {
    /** Match the prompt rendering declared by the trained weights; unadapted models use full. */
    promptRendering?: import('../native/system-prompts.js').PromptRendering;
    endpoint?: string;
    chatCompletionsUrl?: string;
    provider?: string;
    model?: string;
    apiKeyEnv?: string;
    /** The endpoint is a native Neuralese reference server: tuned weights, native state and soft instruction/skill
     * states run through its exact native path (docs/TUNING.md). */
    neuraleseServer?: boolean;
    /** A natlang-owned native reference server for a pinned native checkpoint (model/native-managed.ts): started on the
     * first turn, or reused when one already serves that checkpoint. Written by `natlang setup --native SOURCE`. */
    native?: NativeModelSettings;
    /** Profile that answers a call this profile's model fails (`natlang run|call|ask`; calls/tiers.ts tier 0). */
    escalate?: string;
    /** The endpoint is a vLLM server with LoRA enabled: each tuned call is routed to its whole-stack LoRA by name. */
    vllm?: boolean;
    headers?: Record<string, string>;
    request?: Record<string, unknown>;
    piOptions?: Record<string, unknown>;
    piPayload?: Record<string, unknown>;
    piMode?: 'native' | 'simple';
    modelOptions?: Record<string, unknown>;
    /**
     * Managed server settings. `contextTokens` is per slot. `parallel` is the slot count; unset, it is sized from memory
     * (llama/slots.ts), using `memoryBudgetMiB` (default half of available memory) and `kvBytesPerToken`.
     */
    local?: LocalServerSettings & {
        /** A GGUF to serve instead of the pinned default, its chat template and model ID (`natlang setup --native SOURCE
         * --gguf TYPE` writes these); NATLANG_MODEL_PATH and NATLANG_TEMPLATE still override them. */
        modelPath?: string;
        template?: string;
        modelId?: string;
        /** A stock model of model-catalog.ts by ID (e.g. lfm3-1.7b-q4_k_m) instead of the default; downloaded and verified. */
        stock?: string;
        /** llama-server executable for this profile (e.g. a CUDA build); NATLANG_LLAMA_SERVER still overrides it. */
        server?: string;
    };
    /** Model requests in flight at once from this process (turns and decision scoring together). A managed local server
     * defaults to its slot count, other backends to unlimited. `batching.maxConcurrent` takes precedence. */
    concurrency?: number;
    /** How this backend turns concurrent requests into batches (model/scheduler.ts). */
    batching?: BatchingSettings;
    runtime?: Omit<ModelConfig, 'driver'> & {
        seed?: NatlangRuntimeOptions['seed'];
    };
};
type Common = {
    promptRendering?: ModelProfile['promptRendering'];
    headers?: Record<string, string>;
    runtime?: ModelProfile['runtime'];
    concurrency?: number;
    batching?: BatchingSettings;
};
export type ResolvedModelChoice = (Common & {
    kind: 'managed-local';
    model: string;
    request?: Record<string, unknown>;
    local?: ModelProfile['local'];
    /** The stock model served (undefined for a configured local.modelPath). */
    release?: LocalModelRelease;
}) | (Common & {
    kind: 'external';
    endpoint: string;
    chatCompletionsUrl?: string;
    model: string;
    apiKeyEnv: string;
    request?: Record<string, unknown>;
    neuraleseServer?: true;
    vllm?: true;
    managedNative?: NativeModelSettings;
}) | (Common & {
    kind: 'pi-provider';
    provider: string;
    model: string;
    apiKeyEnv?: string;
    piOptions?: Record<string, unknown>;
    piPayload?: Record<string, unknown>;
    piMode: 'native' | 'simple';
    modelOptions?: Record<string, unknown>;
});
export type ModelSelectionOverrides = {
    provider?: string;
    model?: string;
};
export type LoadedModelConfiguration = {
    name: string;
    configPath: string;
    profile: ModelProfile;
    choice: ResolvedModelChoice;
    /** Named checkpoint pointers for `natlang setup --native NAME` (config `nativeSources`). */
    nativeSources: Record<string, string>;
};
export declare function resolveModelChoice(profile: ModelProfile): ResolvedModelChoice;
/**
 * A program's declared model (natlang.json `model`) as a profile: a machine profile it names (when that exists), else
 * the stock model, endpoint or provider it declares, with its request and slot settings.
 */
export declare function programModelProfile(model: ProgramModel, profiles?: Record<string, ModelProfile>): {
    name: string;
    profile: ModelProfile;
};
export declare function loadModelConfiguration(name?: string, overrides?: ModelSelectionOverrides, environment?: NodeJS.ProcessEnv, program?: ProgramModel): LoadedModelConfiguration;
/** Explicit compatibility identity without authentication material. Profiles are caller-declared metadata. */
export declare function executorIdentityForChoice(choice: ResolvedModelChoice): import('../adaptation/types.js').ExecutorIdentity;
/**
 * An API key for an endpoint profile's `apiKeyEnv` saved by the dashboard (the Pi credential store, entry `env:NAME`),
 * used when the environment variable is unset. Provider profiles keep their keys under the provider's own entry.
 */
export declare function storedApiKey(name: string, environment?: NodeJS.ProcessEnv): string | undefined;
export {};
