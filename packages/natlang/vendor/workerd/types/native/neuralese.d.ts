/**
 * Neuralese literals and references in the runtime (S0 §3, S4 §2.3, §3).
 *
 * A native state value has an opaque reference outside the model and native state parts on the wire:
 *
 * - **Reference form**, everywhere outside the model: `{ $neuralese: { type, id } }`, naming an archived `nzs1` state.
 * - **Transport form**: `native_state` content parts bind exact archived state artifacts at recorded positions.
 *
 * Between the two, the runtime's own conversation text marks a block with a private-use sentinel around its ID. The
 * agent's text handling (cut-offs, compaction, transcript) needs no special case for it; transports turn sentinels into
 * parts, and eval compilation turns them into `__neuralese("id")`, which the checker types from context.
 */
import { type NeuraleseBlockMeta, type NeuralesePort, type NeuraleseStore } from './neuralese-store.js';
import type { DialectBinding, Type, TypeEnv } from './types.js';
export declare const NEURALESE_OPEN = "<|neuralese|>";
export declare const NEURALESE_CLOSE = "<|/neuralese|>";
/** Reference form of a soft value. */
export type NeuraleseRef = {
    readonly $neuralese: {
        readonly type: string;
        readonly id: string;
        readonly stop_gradient?: true;
        readonly source_occurrence?: string;
        readonly teacher_text?: true;
    };
};
/** Opaque reference to a named native coefficient artifact, never a flat Neuralese value block. */
export type NativeAdapterRef = {
    readonly $nativeAdapter: {
        readonly id: string;
    };
};
export declare const isNativeAdapterRef: (value: unknown) => value is NativeAdapterRef;
export declare function nativeAdapterRef(id: string): NativeAdapterRef;
/** Opaque typed reference to a named tensor artifact other than adapter coefficients. */
export type NativeTensorRefKind = Exclude<import('./neuralese-store.js').NativeTensorArtifactMetadata['kind'], 'adapter-coefficients'>;
export type NativeTensorRef = {
    readonly $nativeTensor: {
        readonly id: string;
        readonly kind: NativeTensorRefKind;
    };
};
export declare const isNativeTensorRef: (value: unknown) => value is NativeTensorRef;
export declare function nativeTensorRef(id: string, kind: NativeTensorRefKind): NativeTensorRef;
export type NeuraleseTextPart = {
    type: 'text';
    text: string;
};
export type NativeStateContentPart = {
    type: 'native_state';
    id: string;
    stop_gradient?: true;
    source_occurrence?: string;
};
export type TeacherTextContentPart = {
    type: 'teacher_text';
    id: string;
    value_type?: string;
    source_occurrence?: string;
};
export type ContentPart = NeuraleseTextPart | NativeStateContentPart | TeacherTextContentPart;
export type RuntimeContentPart = ContentPart;
export declare function isNativeTensorArtifactId(value: unknown): value is string;
export declare function isTeacherTextNeuraleseId(value: unknown): value is string;
export declare function isNativeStateId(value: unknown): value is string;
export declare function nativeStateSentinel(id: string, stopGradient?: boolean, sourceOccurrence?: string): string;
export declare function nativeStateSentinelIds(text: string): string[];
export declare function runtimePartsToText(parts: readonly RuntimeContentPart[]): string;
export declare function runtimeTextToParts(text: string): RuntimeContentPart[];
export declare function nativeStateTextToParts(text: string): RuntimeContentPart[];
export declare function isNeuraleseId(value: unknown): value is string;
export declare function neuraleseRef(type: string, id: string, stopGradient?: boolean, sourceOccurrence?: string, teacherText?: boolean): NeuraleseRef;
export declare function isNeuraleseRef(value: unknown): value is NeuraleseRef;
/** The conversation-text marker for a block. */
export declare function neuraleseSentinel(id: string, stopGradient?: boolean, sourceOccurrence?: string): string;
/** Per-use derivative metadata survives conversation plumbing, never model tokens. */
export declare function neuraleseRefSentinel(ref: NeuraleseRef): string;
/** The block a text consists of exactly, if it is one sentinel. */
export declare function soleSentinel(text: string): string | undefined;
export declare function soleSentinelUse(text: string): {
    id: string;
    stop_gradient?: true;
    source_occurrence?: string;
    teacher_text?: true;
} | undefined;
export declare const hasNeuraleseSentinel: (text: string) => boolean;
/** Block IDs a text refers to. */
export declare function sentinelIds(text: string): string[];
/** Conversation text to content parts: text runs and Neuralese blocks. */
export declare function textToParts(text: string): ContentPart[];
export declare const isContentParts: (value: unknown) => value is ContentPart[];
/** Content parts to conversation text. */
export declare function partsToText(parts: readonly ContentPart[]): string;
/**
 * Eval source with its literals as calls the checker types from their context (see compiler/neuralese.ts). A template
 * that is exactly one block is a soft function body, ``nl.with({ … })`${__neuralese.body("nzs1_…")}` ``.
 */
export declare function nativeLiteralArguments(id: string, constant?: boolean, source?: string): string;
export declare function sourceWithLiteralCalls(code: string): string;
/**
 * Store each block a model wrote as marker text (`<|neuralese|>…<|/neuralese|>`) through `port`, and return the text
 * with native-state sentinels in their place. Backends that write native states return parts instead. An unclosed
 * literal is written as truncated by the configured native-state port.
 */
export declare function writeLiterals(text: string, port: NeuralesePort | undefined, producer?: Record<string, unknown>): Promise<{
    text: string;
    parts: ContentPart[];
    blocks: NeuraleseBlockMeta[];
}>;
/** A backend or runtime without Neuralese support was asked to carry a soft value. No text fallback exists. */
export declare class NeuraleseUnsupportedError extends Error {
    readonly code = "neuralese-unsupported-backend";
    constructor(detail: string);
}
/** A soft value met a reader or slot of another dialect. Values are never reused across dialects (NEURALESE_DIALECTS.md). */
export declare class NeuraleseDialectError extends Error {
    readonly code = "neuralese-dialect-mismatch";
    constructor(detail: string);
}
/** A native reader's explicit, checkpoint-bound adaptation capabilities from /info. */
export type NativeStateConsumer = {
    architecture: string;
    checkpoint_sha256: string;
    tokenizer_fingerprint: string;
    embedding_weight_sha256: string;
    consumption_modes: string[];
};
export declare function nativeStateConsumerFromInfo(info: Record<string, unknown>): NativeStateConsumer | undefined;
/** Runtime configuration for soft values. */
export type NeuraleseRuntimeOptions = {
    store: NeuraleseStore;
    /** Case-local exact-text sidecar for explicit teacher-only provider emulation; it contains no tensors. */
    teacherText?: {
        get(id: string): {
            id: string;
            type: string;
            dialect: 'nd:teacher-text/1';
            body: string;
            body_sha256: string;
            producer_call_id: string;
            writer_node?: string;
            type_aliases?: Record<string, string>;
        } | undefined;
        recordWriter(id: string, node: string): void;
    };
    nativeStateConsumer?: NativeStateConsumer;
    /** Refresh a server-backed reader identity before binding state to a model prompt. */
    nativeStateConsumerForCall?: () => Promise<NativeStateConsumer | undefined>;
    /** Writes native state spans for literal text a model returns in a declared typed result. */
    port?: NeuralesePort;
    /**
     * The dialect the runtime's model reads and writes, which `DefaultDialect` stands for. Defaults to the port's; set it
     * when a server writes the blocks (no port in-process). Hosts check it at startup against the server's
     * `/v1/neuralese/info` (`NatlangRuntime.readerDialect()`). It must equal the port's dialect when both are set.
     */
    dialect?: string;
    /**
     * Soft forms of the runtime's prompt pieces (system-prompts.ts), used in place of their text under a Neuralese
     * driver. Their blocks must be in `store` or on the server.
     */
    systemPrompts?: ReadonlyMap<string, {
        readonly text: string;
        readonly value: NeuraleseRef;
    }>;
    /**
     * The Neuralese instance of the builtin `view(value, instructions?)` (neuralese/view.ts `serverViewer`): the opening
     * listing shows a view of each argument it would cut off, written for the receiving call's instructions
     * (prompt.ts `listingViewInstructions`), while the variable keeps the whole value.
     */
    view?: ((site: {
        value: string;
        instructions?: string;
    }, budget?: {
        maxRequests: number | null;
        maxTokens: number | null;
        onUsage: (usage: {
            requests: number;
            tokens: number;
        }) => void;
    }) => Promise<NeuraleseRef | undefined>) & {
        budgeted?: true;
    };
    /**
     * The learned Neuralese operators of the native server (model/native-operator.ts `serverCompactor`): compacted cut-off
     * values, argument listings and history carry, used when the agent's `compaction` setting selects them.
     */
    compactor?: import('./operator-frames.js').Compactor;
    /** The agent's `compaction` setting for hosts that configure the runtime through these options (agent.ts). */
    compaction?: import('../runtime/pluggable.js').PluggableSetting;
};
/**
 * The dialect a runtime with these options reads (DECISIONS.md 2026-10-09: dialects are static facts): the declared
 * dialect, else the port's; null for a text-only runtime.
 */
export declare function readerDialect(options: NeuraleseRuntimeOptions | undefined): string | null;
/** The dialect binding of type checks under these options (TypeEnv.dialects); undefined without Neuralese. */
export declare function dialectBinding(options: NeuraleseRuntimeOptions | undefined): DialectBinding | undefined;
/** A model driver that carries content parts. Transports mark themselves by setting `neuralese: true`. */
export declare const supportsNeuralese: (driver: unknown) => boolean;
/** A model driver whose backend applies guided generation (the `guidance` request field): natlang's servers. The managed
 * llama.cpp fork marks itself with `guidance: true`; Neuralese transports are natlang's servers too. */
export declare const supportsGuidance: (driver: unknown) => boolean;
/**
 * Request messages with sentinels turned into content parts: message `content`, and each tool call's `arguments`,
 * become part arrays where they hold blocks. Messages without blocks are unchanged.
 */
export declare function encodeMessages(messages: readonly unknown[]): {
    messages: unknown[];
    blocks: number;
};
/**
 * A model turn with its native state in conversation-text form: part arrays from the native backend and source
 * markers in the reply text or call arguments become opaque runtime sentinels.
 */
type TurnValueExpectation = {
    type: Type;
    env: TypeEnv;
};
export declare function decodeTurnValue(value: unknown, port: NeuralesePort | undefined, producer: Record<string, unknown>, written?: NeuraleseBlockMeta[], expected?: TurnValueExpectation, nativeStateText?: (id: string) => Promise<string | undefined>): Promise<unknown>;
export {};
