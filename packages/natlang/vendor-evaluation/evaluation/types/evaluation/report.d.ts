import type { EvaluationBatch, EvaluationCase } from './types.js';
/** Paired changes refer to the same case, not an assumed causal attribution to a nested call. */
export declare function pairedChanges(baseline: EvaluationBatch, selected: EvaluationBatch): {
    caseId: string;
    baseline: number | null;
    selected: number | null;
    delta: number | null;
    baselineOutcome: "returned" | "threw";
    selectedOutcome: "returned" | "threw" | null;
}[];
export declare function evaluationSummary(batch: EvaluationBatch, cases: readonly EvaluationCase[]): {
    quality: number | null;
    cases: number;
    gatesPassed: boolean;
    outcomes: Record<string, number>;
    gates: Record<string, {
        passed: number;
        failed: number;
    }>;
    slices: Record<string, {
        count: number;
        quality: number | null;
    }>;
    meanLatencyMs: number | null;
    modelCalls: number;
    coverage: string[];
};
export declare function replicateUncertainty(batches: readonly EvaluationBatch[]): {
    replicates: number;
    completeReplicates: number;
    mean: number | null;
    standardDeviation: number | null;
    standardError: number | null;
};
