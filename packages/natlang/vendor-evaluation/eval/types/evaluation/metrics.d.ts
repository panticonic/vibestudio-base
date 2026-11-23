import type { MetricResult, EvaluationBatch, EvaluationResult } from './types.js';
export declare function validateMetrics(input: MetricResult, required?: readonly string[]): MetricResult;
export declare function summarize(results: readonly EvaluationResult[]): EvaluationBatch;
