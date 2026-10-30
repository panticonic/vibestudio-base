export type NativeModelSettings = {
    /** The pinned complete native checkpoint the server loads. */
    checkpoint: string;
    /** Local snapshot containing the exact checkpoint base; the native loader verifies its inventory. */
    base?: string;
    /** Its SHA-256; the running server must report exactly this checkpoint. */
    sha256: string;
    /** Where the pin came from (a checkpoint pointer, a file or a `nativeSources` name) and its training step. */
    source?: string;
    step?: number;
    /** The SHA-256 of the training checkpoint the pin was made from (an exact copy: equal to `sha256`). */
    sourceSha256?: string;
    /** The checkpoint's compact actor view (native_bundle.prepare_actor_view): its receipt, which binds the exact actor
     * tensors without optimizer/RNG/exposure state. The server loads the view under the full checkpoint's identity
     * (about a tenth of the startup time and a third of the host memory); `checkpoint` stays the complete source. */
    actorView?: ActorView;
    /** Interpreter with natlang_neuralese importable, and extra PYTHONPATH entries. */
    python?: string;
    pythonPath?: string[];
    device?: string;
    dtype?: 'float32' | 'bfloat16';
    memoryGb?: number;
    contextTokens?: number;
    /** Fixed local port; default derived from the checkpoint, so every natlang process finds the same server. */
    port?: number;
    /** Keep native blocks on disk (`--store-dir`): true for the server default, or a directory. */
    storeDir?: string | true;
    /** Memory for reusing prompt-prefix state across calls (`--prefix-cache-gb`; default 2, 0 turns it off). Calls of
     * one function share their long instructions, so later calls prefill only what differs. */
    prefixCacheGb?: number;
    /** Further server arguments. */
    args?: string[];
    /** Prefix that launches the server command, e.g. a memory ledger `run ... --`, and the command that stops what it
     * launched. `{port}` and `{unit}` are substituted. Without `stop`, the server is this process's child. */
    launcher?: string[];
    stop?: string[];
    /** How long the first start may take (default 15 minutes: loading and a launcher's admission queue). */
    startTimeoutMs?: number;
};
export type ActorView = {
    path: string;
    sha256: string;
    bytes: number;
};
export declare function validateNativeSettings(native: NativeModelSettings): void;
export declare function nativePort(native: NativeModelSettings): number;
export declare const nativeEndpoint: (native: NativeModelSettings) => string;
/** Interpreter and PYTHONPATH defaults: the checkout's `.venv-neuralese` and training packages when present. */
export declare function defaultNativePython(environment?: NodeJS.ProcessEnv): Pick<NativeModelSettings, 'python' | 'pythonPath'>;
export declare function nativeServerCommand(native: NativeModelSettings, environment?: NodeJS.ProcessEnv): {
    command: string[];
    env: NodeJS.ProcessEnv;
};
/** The exact base a native checkpoint serves as (what tuned adapters bind): the server reports it. */
export type NativeIdentity = {
    architecture: string;
    checkpoint_sha256: string;
    embedding_weight_sha256: string;
    tokenizer_fingerprint: string;
};
/** Whether a server at the profile's port is serving its exact checkpoint now. */
export declare function nativeServing(native: NativeModelSettings): Promise<'serving' | 'other' | 'stopped'>;
/** The identity a pin's server reported (recorded in the pin index when the server is first seen serving it). */
export declare function nativeIdentity(sha256: string, environment?: NodeJS.ProcessEnv): NativeIdentity | undefined;
/** Ensure the profile's native server is serving its exact checkpoint: reuse one that is, else start it. */
export declare function ensureNativeServer(native: NativeModelSettings, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream): Promise<void>;
/** Stop the server at `endpoint` if this process started it; a reused server keeps running. */
export declare function stopNativeServer(endpoint: string): Promise<void>;
export declare const ownsNativeServer: (endpoint: string) => boolean;
export type CheckpointPointer = {
    path: string;
    sha256?: string;
    bytes?: number;
    step?: number;
};
/**
 * A checkpoint source: a `.pt` file, or a JSON pointer to one. Pointers name the file as `local_full_state`,
 * `checkpoint` or top-level `path`, with optional `sha256`, `bytes` and `global_step`/`step`.
 */
export declare function readCheckpointPointer(source: string): CheckpointPointer;
export declare const nativeModelsDirectory: (environment?: NodeJS.ProcessEnv) => string;
type Pin = {
    checkpoint: string;
    sha256: string;
    bytes: number;
    sourceSha256: string;
    step?: number;
    actorView?: ActorView;
    identity?: NativeIdentity;
    reused: boolean;
};
/** Pin the source checkpoint as `<native-models>/<sha256>.pt`, an exact copy; reuse an earlier pin of the same source. */
export declare function pinNativeCheckpoint(pointer: CheckpointPointer, python?: Pick<NativeModelSettings, 'python' | 'pythonPath'>, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream): Promise<Pin>;
/** Forget a pin no profile uses any more: its file and its index entry. */
export declare function removeNativePin(checkpoint: string, environment?: NodeJS.ProcessEnv): boolean;
/** A newer checkpoint behind the pin's source pointer, for a one-line notice; undefined when current or unknown. */
export declare function newerNativeCheckpoint(native: NativeModelSettings, sources?: Record<string, string>): CheckpointPointer | undefined;
export type NativeGguf = {
    modelPath: string;
    sha256: string;
    template: string;
    templateKwargs: Record<string, unknown>;
    logitBias: Record<string, number>;
    reused: boolean;
};
/** Export (or reuse) a pinned checkpoint as GGUF beside its pin (export/native_gguf.py: learned rows merged, the
 * native chat template, the producer marker banned). Ordinary-token execution only; see docs/NATIVE_MODELS.md. */
export declare function exportNativeGguf(native: Pick<NativeModelSettings, 'checkpoint' | 'sha256' | 'python' | 'pythonPath'>, outtype: string, environment?: NodeJS.ProcessEnv, error?: NodeJS.WritableStream): Promise<NativeGguf>;
/**
 * Where the checkpoint with SHA-256 `sha256` can be read: an existing pin, a tune job of the program that trained on it
 * (`.natlang/tune/jobs/<key>/plan.json` records the student checkpoint and its exact base), or a `nativeSources`
 * pointer to it. A tune plan names a file without a hash of its own, so pinning verifies it against `sha256`.
 */
export declare function findNativeCheckpoint(sha256: string, options?: {
    programRoot?: string;
    sources?: Record<string, string>;
}, environment?: NodeJS.ProcessEnv): {
    pinned?: string;
    pointer?: CheckpointPointer;
    step?: number;
} | undefined;
export {};
