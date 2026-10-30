/**
 * In-run training guidance (applications/guidance-writer/README.md). A training run hands the agent verified facts
 * (`x_natlang_guidance`, `natlang.guidance-run/1`); for each consumer call, on its first model turn, the agent keeps the
 * facts the call may see, selects them with `selectGuidanceFacts` (the pluggable's crisp or natural-language side) and
 * runs `writeGuidance` in-process as a child call of the consumer, on the same runtime, model and recorder. Every turn of
 * the consumer then carries the `natlang.guidance-request/1` the engine renders (rl/privileged_context `guidance_plan`,
 * whose `_request_parts` is the exact contract), and every turn of the policy calls carries `x_natlang_guidance_policy`.
 *
 * The package's crisp parts and definitions are loaded by the host (teacher/guidance-writer.ts, Node); this module is the
 * platform-neutral mechanism around them.
 */
import type { CallableDefinition } from '../runtime/kernel.js';
import type { PluggableMode } from '../runtime/pluggable.js';
import type { LambdaNode } from './values.js';
import type { NativeSession } from './runtime.js';
export declare const GUIDANCE_RUN_SCHEMA = "natlang.guidance-run/1";
export declare const GUIDANCE_REQUEST_SCHEMA = "natlang.guidance-request/1";
export declare const GUIDANCE_FACT_KINDS: readonly ["expected_result", "expected_stop", "expected_files", "expected_effects", "reference_failure", "reference_solution", "child_value", "minimum_sequence", "decisive", "teacher_trajectory", "attempt_feedback", "fit_hindsight"];
/** The token budget a selection is asked to fit when the run names none (the engine's declared rendering budget). */
export declare const DEFAULT_GUIDANCE_BUDGET_TOKENS = 512;
/** The recorded text-fallback reason of a run whose writer is switched off. */
export declare const WRITER_OFF = "writer disabled by run setting";
export type GuidanceFact = {
    id: string;
    kind: typeof GUIDANCE_FACT_KINDS[number];
    text: string;
    invocation?: string | null;
    match?: string[];
};
export type GuidanceConsumer = {
    name: string;
    role: 'root' | 'child' | 'binding';
    text: string;
};
export type GuidanceRun = {
    schema: typeof GUIDANCE_RUN_SCHEMA;
    role: 'teacher' | 'student';
    custody: Record<string, unknown>;
    facts: GuidanceFact[];
    selection?: PluggableMode;
    budgetTokens?: number;
    /** `off` (opt-out, the measurement baseline): no writer; a teacher gets the selected facts as text, a student has the
     * same text turn recorded for its OPSD twin (`text-twin`) and sees nothing. */
    writer?: 'native' | 'off';
};
export type GuidancePolicyFunction = {
    function: 'selectGuidanceFacts' | 'writeGuidance';
    sha256: string;
};
/** The guidance-writer package as loaded by the host: its two natural-language definitions and its crisp parts. */
export type GuidanceWriterPackage = {
    selection: {
        definition: CallableDefinition;
        sha256: string;
    };
    writer: {
        definition: CallableDefinition;
        sha256: string;
    };
    /** visibility.ts `visibleFacts`. */
    visibleFacts(consumer: GuidanceConsumer, facts: readonly GuidanceFact[]): GuidanceFact[];
    /** crispSelection.ts `crispSelection`. */
    crispSelection(consumer: GuidanceConsumer, facts: readonly GuidanceFact[], budgetTokens: number): string[];
    /** sha256 hex of crispSelection.ts `CRISP_SELECTION_IDENTITY`. */
    crispSha256: string;
};
/** Validate a run-level `x_natlang_guidance` control (rl/jolt.py `guidance_controls` writes it). Returns it unchanged. */
export declare function guidanceRun(value: unknown): GuidanceRun;
/** The prompt text of one model request, as the engine computes it for visibility: string contents joined by newlines. */
export declare function requestText(messages: readonly unknown[]): string;
/**
 * One run's training guidance. The agent asks `policyOf` whether a call is the guidance policy's own (its turns carry
 * `x_natlang_guidance_policy` and get no guidance), and `requestFor` for a consumer call's guidance request.
 */
export declare class TrainingGuidance {
    readonly run: GuidanceRun;
    readonly writerPackage: GuidanceWriterPackage;
    /** Calls running the guidance policy: they and every call below them get no guidance. */
    private readonly policyCalls;
    private readonly requests;
    constructor(run: GuidanceRun, writerPackage: GuidanceWriterPackage);
    /** The policy function a call runs, by its exact definition (name and instructions), and remembers the call. */
    policyOf(lam: LambdaNode, callId: string | null): GuidancePolicyFunction | undefined;
    /** Whether a call runs inside the guidance policy (its own calls and theirs). */
    insidePolicy(session: NativeSession): boolean;
    /**
     * The `natlang.guidance-request/1` of a consumer call, computed once on its first model turn from that turn's request
     * messages and reused by its later turns; undefined when the call gets no guidance.
     */
    requestFor(session: NativeSession, callId: string, messages: readonly unknown[]): Promise<Record<string, unknown> | undefined>;
    private compute;
}
