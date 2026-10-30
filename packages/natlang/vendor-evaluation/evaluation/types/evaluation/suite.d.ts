import type { EvaluationSuite, EvaluationCase, PreparedSuite } from './types.js';
export declare function defineEvaluationSuite<I, E>(suite: EvaluationSuite<I, E>): EvaluationSuite<I, E>;
export declare function validateCases(cases: readonly EvaluationCase[]): readonly EvaluationCase[];
export declare function validateBudget(budget: EvaluationSuite['budget']): void;
/** A module URL is mandatory: fixture functions are imported afresh in workers, never serialized. */
export declare function prepareEvaluationSuite(suite: EvaluationSuite, moduleURL: string): Promise<PreparedSuite>;
export declare function loadEvaluationSuite(path: string): Promise<PreparedSuite>;
