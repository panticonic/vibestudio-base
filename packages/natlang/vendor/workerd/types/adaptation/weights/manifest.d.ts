import type { NativeModelIdentity } from '../../native/neuralese-store.js';
export declare const WEIGHTS_SCHEMA: "natlang.adapters/v1";
export type ScopeLevel = 'tree' | 'folder' | 'lambda';
/** One node of the lexical adapter-scope tree; `parent` is null only for the program root. */
export type ScopeNode = {
    readonly id: string;
    readonly level: ScopeLevel;
    readonly path: string;
    readonly parent: string | null;
};
/** A bound definition: its component, its context binding (null: its file context) and ordered scope ancestry. */
export type WeightBindingEntry = {
    readonly id: string;
    readonly component: string;
    /** The persistent site this component continues, when it differs from the component key (an edited inline site). */
    readonly site?: string;
    readonly definitionId: string | null;
    readonly contextId: string | null;
    readonly origin: 'named' | 'authored-inline';
    /** Root first, the binding's own lambda node last. */
    readonly ancestry: readonly string[];
    /** The component's baseline and contract hashes the adapters were trained against. */
    readonly semanticHash: string;
};
/** A trained residual for one scope node: an archived nnt1 coefficient artifact. `requires` names the exact parent
 * artifacts it was fit against, so a fallback never keeps a child without the parent version it assumed. */
export type WeightArtifact = {
    readonly node: string;
    readonly artifact: string;
    readonly rank: number;
    readonly parameterization: 'native-subspace' | 'free-lora';
    readonly requires: readonly string[];
    /** Backend exports of this residual, paths relative to the release directory (tune/export.py receipts). */
    readonly exports?: WeightExports;
};
/** A GGUF LoRA for the llama.cpp fork and wllama binds the exact base GGUF it was converted against. */
export type WeightExports = {
    readonly gguf?: {
        readonly file: string;
        readonly sha256: string;
        readonly baseGgufSha256: string;
    };
    readonly peft?: {
        readonly directory: string;
        readonly sha256: string;
    };
};
/** An immutable published family version for this base; its amplitude is fixed (§5.4). */
export type FamilyVersion = {
    readonly family: string;
    readonly version: string;
    readonly artifact: string;
    readonly amplitudeHex: string;
    /** Backend exports of the unscaled family residual; a member's gate is its request scale. */
    readonly exports?: WeightExports;
};
/** A static per-binding family membership with its learned, bounded gate. */
export type FamilyMembership = {
    readonly binding: string;
    readonly family: string;
    readonly version: string;
    readonly gate: number;
};
/**
 * Directly tuned native state of a binding (plan §3.3): its instructions or one bound skill document, initialized by
 * writing the exact text with the executing reader, then optimized as a parameter. Consumed in place of that text
 * only when the text still hashes to `textSha256`.
 */
export type SoftState = {
    readonly binding: string;
    readonly kind: 'instructions' | 'skill';
    /** For a skill: its disclosure target (`skills.<name>` or `skills.<name>/<file>`); null for instructions. */
    readonly target: string | null;
    /** The tuned `nzs1` native-state ID (bound to the manifest base). */
    readonly state: string;
    readonly textSha256: string;
    readonly tokens: number;
    /** The state as a llama.cpp native state span (`--native-state`), bound to the exact base GGUF. */
    readonly exports?: {
        readonly gguf?: {
            readonly file: string;
            readonly sha256: string;
            readonly baseGgufSha256: string;
        };
    };
};
export type WeightManifest = {
    readonly schema: typeof WEIGHTS_SCHEMA;
    readonly program: {
        readonly id: string;
        readonly buildHash: string;
    };
    /** The exact base the adapters were trained on. */
    readonly base: NativeModelIdentity;
    readonly tree: readonly ScopeNode[];
    readonly bindings: readonly WeightBindingEntry[];
    readonly artifacts: readonly WeightArtifact[];
    readonly families: readonly FamilyVersion[];
    readonly memberships: readonly FamilyMembership[];
    /** Tuned instruction and skill states per binding. */
    readonly softStates: readonly SoftState[];
    /** Fixed deployment/ablation scale per node (normally 1 or 0); absent means 1. */
    readonly scales: Readonly<Record<string, number>>;
    /** Reduced stacks (sorted artifact IDs) validated as usable when some artifacts are unavailable. */
    readonly validatedReductions: readonly (readonly string[])[];
    /** What runs when a binding's stack cannot be served. Only the compatible base executor is declared today. */
    readonly fallback: 'base';
    /** Build receipts (data, training, export); opaque here. */
    readonly receipts: Readonly<Record<string, unknown>>;
    readonly digest: string;
};
export declare class WeightManifestError extends Error {
    constructor(message: string);
}
export declare function manifestDigest(manifest: Omit<WeightManifest, 'digest'> | WeightManifest): string;
/** Seal a manifest: compute its digest and freeze it. */
export declare function sealManifest(manifest: Omit<WeightManifest, 'digest'>): WeightManifest;
/** Exact structural validation. Throws on the first problem with the field that is wrong. */
export declare function validateManifest(value: unknown): asserts value is WeightManifest;
export declare function parseManifest(text: string): WeightManifest;
