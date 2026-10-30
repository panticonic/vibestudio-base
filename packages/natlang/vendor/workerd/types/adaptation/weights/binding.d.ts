import { type NativeModelIdentity } from '../../native/neuralese-store.js';
import type { NativeAdapterBinding } from '../../native/model-recording.js';
import type { ProgramDescriptor } from '../types.js';
import type { WeightManifest } from './manifest.js';
export type WeightStatus = 'ready' | 'stale' | 'degraded';
export type StackEntry = NativeAdapterBinding & {
    readonly node: string;
};
/** What one call runs with, as recorded in its trace. */
export type ResolvedWeightStack = {
    readonly release: string;
    readonly program: string;
    readonly binding: string | null;
    readonly requested: readonly StackEntry[];
    readonly effective: readonly StackEntry[];
    readonly skipped: readonly {
        readonly artifact: string;
        readonly node: string;
        readonly reason: string;
    }[];
    readonly status: WeightStatus | 'untuned';
    readonly reason?: string;
    /** Directly tuned instruction/skill states this call consumes in place of their exact texts (plan §3.3). */
    readonly soft?: {
        readonly instructions?: SoftUse;
        readonly skills: Readonly<Record<string, SoftUse>>;
    };
    /** Canonical identity of the effective stack over the exact base; equal stacks share it. */
    readonly identity: string;
    /** The identity of the untuned base executor for this release (what a fallback runs). */
    readonly baseIdentity: string;
};
export type SoftUse = {
    readonly state: string;
    readonly textSha256: string;
};
export declare class WeightBindingError extends Error {
    readonly code: 'weights-incompatible' | 'weights-unavailable' | 'weights-stale';
    constructor(code: 'weights-incompatible' | 'weights-unavailable' | 'weights-stale', message: string);
}
export type WeightBindingOptions = {
    /** The executing base. A release trained on another base is incompatible and falls back as a whole. */
    readonly executor?: NativeModelIdentity;
    /** Artifacts the selected backend acknowledged as loaded; absent means all were acknowledged at activation. */
    readonly available?: ReadonlySet<string>;
    /** The program as currently compiled, to detect bindings whose semantics changed after training. */
    readonly program?: ProgramDescriptor;
    /** Evaluation/export validation: missing, stale or incompatible artifacts throw instead of falling back. */
    readonly strict?: boolean;
    /** The serving backend found the release incompatible (for example its GGUF exports bind another base file). */
    readonly incompatible?: string;
    /** Whether the serving backend imports stored native state; soft instruction/skill states need it. */
    readonly nativeState?: boolean;
};
export declare function stackIdentity(base: NativeModelIdentity, stack: readonly StackEntry[], soft?: ResolvedWeightStack['soft']): string;
/** The same call run untuned (a soft text no longer matches its trained text): base executor, marked degraded. */
export declare function untunedStack(stack: ResolvedWeightStack, reason: string): ResolvedWeightStack;
export declare class WeightBinding {
    readonly manifest: WeightManifest;
    readonly options: WeightBindingOptions;
    private readonly byDefinition;
    private readonly byComponent;
    private readonly cache;
    readonly status: WeightStatus;
    readonly reason?: string;
    private readonly staleBindings;
    constructor(manifest: WeightManifest, options?: WeightBindingOptions);
    get release(): string;
    get programId(): string;
    /** The stack for one call of a definition (by definition ID or component key) in a context (null: file context). */
    resolve(definitionId: string, component: string | undefined, contextId: string | null): ResolvedWeightStack;
    private base;
    private resolveEntry;
}
/** The binding of a definition's owning program among the runtime's releases. */
export declare function weightBindingFor(bindings: readonly WeightBinding[] | undefined, programId: string | undefined): WeightBinding | undefined;
/** The served name of a whole effective stack on one-adapter-per-request backends (vLLM): canonical in its entries. */
export declare function stackServingName(entries: readonly {
    id: string;
    scale: number;
}[]): string;
