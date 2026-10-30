import { type NativeStateDerivation } from './native-derivative-contract.js';
/** Metadata for a native state or named tensor artifact. */
export type NeuraleseBlockMeta = {
    id: string;
    dialect: string;
    /** Canonical type string of the value, when the writer knows it. The ID does not depend on it. */
    type?: string;
    length: number;
    width: number;
    /** Invocation, file, combinator call or gradient step that produced the block. */
    producer?: Record<string, unknown>;
    /** Present for exact multi-tensor state; this metadata is not a flat-vector payload. */
    native_state?: NativeStateMetadata & {
        embedding_dtype: NativeStateDtype;
    };
    /** Named gradients/parameters live in their own tensor domain, never a flat value payload. */
    native_tensor_artifact?: NativeTensorArtifactMetadata;
    /** Writing hit the runtime's hard maximum instead of stopping. */
    truncated?: boolean;
};
export type NativeStateDtype = 'F16' | 'BF16' | 'F32' | 'F64' | 'I64';
export type NativeStateTensor = {
    dtype: NativeStateDtype;
    shape: number[];
    data: Uint8Array;
};
export type NativeAdapterBinding = {
    schema: 'natlang.native-adapter/1';
    base_native_identity: NativeModelIdentity;
    adapters: {
        id: string;
        scale_hex: string;
    }[];
};
export type NativeAdapterStateConsumption = {
    schema: 'natlang.native-adapter-state-consumption/1';
    mode: 'same-base-adapter-state';
    source_state_id: string;
    source_native_identity: Record<string, string>;
    target_native_identity: Record<string, string>;
    base_native_identity: Record<string, string>;
    source_adapter_binding: NativeAdapterBinding | null;
    target_adapter_binding: NativeAdapterBinding | null;
    target_position_start: number;
    tokens: number;
};
export type NativeInvocationActorReceipt = {
    schema: 'natlang.native-invocation-actors/1';
    base_native_identity: NativeModelIdentity;
    invocations: Record<string, {
        native_identity: NativeModelIdentity;
        adapter_binding: NativeAdapterBinding | null;
    }>;
};
export type NativeStateMetadata = {
    text: string;
    architecture: string;
    tokenizer_fingerprint: string;
    checkpoint_sha256: string;
    embedding_weight_sha256: string;
    layer_kinds: string[];
    adapter_binding?: NativeAdapterBinding;
    derivation?: NativeStateDerivation;
} & ({
    schema: 'neuralese.native-state/1';
} | {
    schema: 'neuralese.semantic-state/1';
    source_model: string;
    adapter_sha256: string;
    offsets: number[][];
    posterior: 'mean';
    offset_policy: 'exact-tokenizer-offsets' | 'actual-token-decoder-alignment' | 'actual-token-decoder-text-alignment';
});
export type NativeStateArtifact = {
    id: string;
    metadata: NativeStateMetadata;
    tensors: Record<string, NativeStateTensor>;
};
export type NativeTensorDtype = 'F16' | 'BF16' | 'F32' | 'F64';
export type NativeTensorValue = {
    dtype: NativeTensorDtype;
    shape: number[];
    data: Uint8Array;
};
export type NativeModelIdentity = {
    checkpoint_sha256: string;
    tokenizer_fingerprint: string;
    embedding_weight_sha256: string;
    architecture: string;
};
/** Compare exact model identity fields independently of JSON property order. */
export declare function nativeModelIdentityEqual(left: NativeModelIdentity, right: NativeModelIdentity): boolean;
export type NativeTensorArtifactMetadata = {
    schema: 'natlang.neuralese-native-tensor-artifact/1';
    kind: 'parameter-set' | 'parameter-gradient' | 'parameter-update' | 'state-gradient' | 'optimizer-state' | 'adapter-basis' | 'adapter-coefficients' | 'adapter-gradient' | 'derivative-program';
    native_identity: NativeModelIdentity;
    source_artifact_id: string | null;
    provenance: Record<string, unknown>;
    tensors: {
        name: string;
        dtype: NativeTensorDtype;
        shape: number[];
    }[];
};
export type NativeTensorArtifact = {
    id: string;
    metadata: NativeTensorArtifactMetadata;
    tensors: Record<string, NativeTensorValue>;
    canonicalMetadata?: string;
};
/** Existing typed-value metadata derived from a verified native artifact. */
export declare function nativeStateBlockMeta(artifact: Pick<NativeStateArtifact, 'id' | 'metadata'> & {
    tensors: Record<string, Pick<NativeStateTensor, 'dtype' | 'shape'>>;
}): NeuraleseBlockMeta;
export declare function nativeTensorArtifactBlockMeta(artifact: Pick<NativeTensorArtifact, 'id' | 'metadata'>): NeuraleseBlockMeta;
/** Required executable dependencies, distinct from historical provenance references. */
export declare function nativeTensorArtifactDependencies(artifact: Pick<NativeTensorArtifact, 'metadata'>): string[];
/** Exact native state dependencies, including original producers and update DAGs. */
export declare function nativeStateArtifactDependencies(artifact: Pick<NativeStateArtifact, 'metadata'>): string[];
/** Archive either typed native family through one exact dependency mechanism. */
export declare function archiveNativeArtifactFrom(remote: NeuraleseStore, archive: NeuraleseStore, id: string, active?: Set<string>): Promise<NativeStateArtifact | NativeTensorArtifact>;
export declare function archiveNativeTensorFrom(remote: NeuraleseStore, archive: NeuraleseStore, id: string): Promise<NativeTensorArtifact>;
/** Restore a mixed native bundle in dependency order, sharing every archive writer. */
export declare function importNativeArtifactBundle(store: Pick<NeuraleseStore, 'has' | 'putNativeState' | 'putNativeTensorArtifact'>, states: Map<string, NativeStateArtifact>, tensors: Map<string, NativeTensorArtifact>): Promise<void>;
/** Exact executable dependency closure for retention and portable values. */
export declare function nativeArtifactDependencyClosure(store: Pick<NeuraleseStore, 'getNativeState' | 'getNativeTensorArtifact'>, roots: Iterable<string>): Promise<Set<string>>;
/** Client interface to a native artifact archive: in memory, on disk, or a model server's native artifact endpoints. */
export interface NeuraleseStore {
    meta(id: string): Promise<NeuraleseBlockMeta | undefined>;
    has(id: string): Promise<boolean>;
    /**
     * Metadata of an artifact this store holds, or was told about with `note`, without I/O (a process-local store), for
     * synchronous checks such as a value's dialect when it is coerced to a type (native/values.ts) or a state span's length
     * in a context estimate. Undefined when the store would have to ask.
     */
    peek?(id: string): NeuraleseBlockMeta | undefined;
    /**
     * Remember metadata of a native artifact held elsewhere, so `peek` can answer without I/O. It does not make the
     * artifact present: `has`, `getNativeState`, `getNativeTensorArtifact` and `meta` still answer for held artifacts only.
     */
    note?(meta: NeuraleseBlockMeta): void;
    /** Keep a native artifact through garbage collection (for example while a file or a running call refers to it). */
    pin(id: string): Promise<void>;
    unpin(id: string): Promise<void>;
    /** Drop every unpinned artifact that `referenced` does not name. Returns the IDs removed. */
    collect(referenced: ReadonlySet<string>): Promise<string[]>;
    /** Exact positional-KV/hybrid-state and named tensor artifacts share this store's ownership lifecycle. */
    putNativeState(artifact: Omit<NativeStateArtifact, 'id'>): Promise<NativeStateArtifact>;
    getNativeState(id: string): Promise<NativeStateArtifact | undefined>;
    hasNativeState(id: string): Promise<boolean>;
    putNativeTensorArtifact(artifact: Omit<NativeTensorArtifact, 'id'>): Promise<NativeTensorArtifact>;
    getNativeTensorArtifact(id: string): Promise<NativeTensorArtifact | undefined>;
    hasNativeTensorArtifact(id: string): Promise<boolean>;
}
export declare function validateNativeAdapterBinding(binding: NativeAdapterBinding, metadata: NativeModelIdentity): void;
/** Exact actor receipt verifier; importing another actor is always caller-declared. */
export declare function validateNativeAdapterStateConsumption(receipt: NativeAdapterStateConsumption, source: NativeStateArtifact, target: NativeStateMetadata): void;
export declare function validateNativeInvocationActorReceipt(receipt: NativeInvocationActorReceipt, base: NativeModelIdentity): void;
export type NativeInvocationBehaviorPolicy = {
    schema: 'natlang.native-invocation-policy/1';
    base_native_identity: NativeModelIdentity;
    collector_policy_role: 'base-runtime-metadata';
    episodes: Record<string, NativeInvocationActorReceipt>;
};
export declare function validateNativeInvocationBehaviorPolicy(policy: NativeInvocationBehaviorPolicy, base: NativeModelIdentity): void;
export declare function nativeCanonicalJson(value: unknown): string;
/** ID algorithm shared byte-for-byte with model.native_artifact.native_tensor_artifact_id. */
export declare function nativeTensorArtifactContentId(metadata: NativeTensorArtifactMetadata, tensors: Record<string, NativeTensorValue>, canonicalMetadata?: string): string;
/** Versioned native gradient/parameter safetensors body matching Python exactly. */
export declare function encodeNativeTensorArtifact(artifact: Omit<NativeTensorArtifact, 'id'>): Uint8Array;
export declare function decodeNativeTensorArtifact(bytes: Uint8Array): NativeTensorArtifact;
/** Versioned ID shared byte-for-byte with `serve.store.native_state_id` (Python). */
export declare function nativeStateContentId(metadata: NativeStateMetadata, tensors: Record<string, NativeStateTensor>): string;
/** Multi-tensor safetensors body matching Python `encode_native_state`. */
export declare function encodeNativeState(artifact: Omit<NativeStateArtifact, 'id'>): Uint8Array;
/** Decode and verify an immutable native state safetensors artifact. */
export declare function decodeNativeState(bytes: Uint8Array): NativeStateArtifact;
/** Process-local store; the default for runtimes without a model-side store, and for tests. */
export declare class MemoryNeuraleseStore implements NeuraleseStore {
    private readonly nativeStates;
    private readonly nativeTensorArtifacts;
    /** Metadata of blocks held elsewhere (`note`). */
    private readonly noted;
    private readonly pins;
    meta(id: string): Promise<NeuraleseBlockMeta | undefined>;
    has(id: string): Promise<boolean>;
    putNativeState(artifact: Omit<NativeStateArtifact, 'id'>): Promise<NativeStateArtifact>;
    getNativeState(id: string): Promise<NativeStateArtifact | undefined>;
    hasNativeState(id: string): Promise<boolean>;
    putNativeTensorArtifact(artifact: Omit<NativeTensorArtifact, 'id'>): Promise<NativeTensorArtifact>;
    getNativeTensorArtifact(id: string): Promise<NativeTensorArtifact | undefined>;
    hasNativeTensorArtifact(id: string): Promise<boolean>;
    peek(id: string): NeuraleseBlockMeta | undefined;
    note(meta: NeuraleseBlockMeta): void;
    pin(id: string): Promise<void>;
    unpin(id: string): Promise<void>;
    collect(referenced: ReadonlySet<string>): Promise<string[]>;
    get size(): number;
}
/** Write port: records a model's native-state output as a stored artifact.
 * Returned type/producer/truncation describe this write occurrence. The content
 * store may retain an earlier producer for an identical payload; occurrence receipts
 * remain separate from the content-addressed artifact.
 */
export interface NeuralesePort {
    readonly dialect: string;
    write(text: string, options?: {
        type?: string;
        producer?: Record<string, unknown>;
        truncated?: boolean;
    }): Promise<NeuraleseBlockMeta>;
}
