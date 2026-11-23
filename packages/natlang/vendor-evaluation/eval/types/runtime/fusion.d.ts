import { type NeuraleseRef, type NeuraleseRuntimeOptions } from '../native/neuralese.js';
import { type Frame } from './context.js';
export type FusionMode = 'off' | 'shadow' | 'on';
export declare const FUSION_CERTIFICATE_SCHEMA = "natlang.fusion-certificate/1";
/** A fused edge, as the runtime needs it. `src/fusion` derives these from the facts and the verified plan. */
export type FusionEdgeSpec = {
    id: string;
    /** Source of the orchestrating function whose call made both calls. */
    scope: string;
    producer: {
        source: string;
    };
    consumer: {
        source: string;
        param: string;
    };
    /** The declared result type of the producer (`T`). */
    type: string;
    /**
     * Edges of crisp TypeScript orchestrators have no calling function to read the scope from. The compiler marks the two
     * calls instead (`__natlang.fuseSite`), and these are their site IDs (`file@offset`, compiler/call-flow.ts).
     */
    sites?: {
        producer: string;
        consumer: string;
    };
};
/**
 * What the training pipeline issues once the exact weights pass runtime qualification (TRAINING_RECIPE.md stages 4-5):
 * transport, gradient replay and typed function execution on the production encode/read/write path, and the
 * self-feedback channel-equivalence and generation-quality gates (DECISIONS.md, 2026-10-09).
 */
export type FusionCertificate = {
    schema: typeof FUSION_CERTIFICATE_SCHEMA;
    model: {
        id: string;
        weights_sha256: string;
    };
    /** The dialect tag the weights read and write (`nd:<name>@<version>`). */
    dialect: string;
    runtime_qualification: {
        status: 'passed' | 'failed';
        scope: string[];
        report_sha256: string;
        self_feedback?: {
            channel_equivalence: 'passed' | 'failed';
            generation_quality: 'passed' | 'failed';
        };
    };
    foundation_certificate_sha256?: string;
    issued_at?: string;
    issuer?: string;
};
export type FusionOptions = {
    mode: FusionMode;
    edges: readonly FusionEdgeSpec[];
    certificate?: FusionCertificate;
    /** Digest of the weights the active profile serves; the certificate must name the same. */
    weights?: string;
    /** Decode a fused block back to a value, for shadow comparison (default: the typed `read`). */
    readback?: (ref: NeuraleseRef) => Promise<unknown>;
    /** Whether two values agree (default: equal JSON). */
    agree?: (text: unknown, fused: unknown) => boolean;
};
export type FusionStatus = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** Whether fusion may engage for a call on `model`: the backend carries Neuralese and the certificate matches. */
export declare function fusionStatus(options: FusionOptions, neuralese: NeuraleseRuntimeOptions | undefined, model: {
    id?: string;
    driver: unknown;
} | undefined): FusionStatus;
/** What the kernel asks of a call it is about to run. */
export type FusionEngagement = {
    /** The definition to run: its result or one parameter retyped to `Neuralese<T>` on a fused edge; else unchanged. */
    definition: FusedDefinition;
    /** Called with the call's host value once it has one (shadow: starts the comparison). */
    produced?: (value: unknown) => void;
};
type FusedDefinition = {
    returns: string;
    params: {
        name: string;
        type: string;
        optional?: boolean;
    }[];
};
/** Fusion events of calls the host made (crisp TypeScript orchestrators), which have no calling function's trace to join. */
export declare function fusionHostEvents(task: object): readonly {
    kind: string;
    data: Record<string, unknown>;
}[];
/** Edges that produced a fused block no consumer took, per task (a planned consumer never received it). */
export declare function unconsumedFusedBlocks(task: object): string[];
/**
 * Decide, for the call of `definition` with `inputs` made inside `frame`, whether a planned edge applies, and retype
 * the call if so. `invoke` runs a call the way the kernel does (used by shadow measurement). Returns nothing when
 * fusion is off or no planned edge involves this call.
 */
export declare function engageFusion<D extends FusedDefinition & {
    source?: string;
    name: string;
    types?: Record<string, string>;
}>(frame: Frame, definition: D, inputs: readonly unknown[], invoke: (frame: Frame, definition: D, inputs: unknown[]) => Promise<unknown>): {
    definition: D;
    produced?: (value: unknown) => void;
} | undefined;
export {};
