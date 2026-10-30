import { type Candidate, type AdaptationArtifact } from '../adaptation/types.js';
import { type BudgetLedger } from './usage.js';
import type { PreparedSuite, EvaluateOptions, EvaluationBatch } from './types.js';
export declare class EvaluationInfrastructureError extends Error {
    readonly caseId: string;
    readonly attempt: number;
    readonly ledger: BudgetLedger;
    constructor(caseId: string, attempt: number, cause: unknown, ledger: BudgetLedger);
}
/** Import/create/dispose every fixture without executing or scoring paid inference. */
export declare function preflightEvaluation(prepared: PreparedSuite): Promise<{
    cases: number;
    suiteHash: string;
}>;
export declare function candidateArtifact(prepared: PreparedSuite, candidate: Candidate, runId?: string): AdaptationArtifact;
export declare function evaluate(prepared: PreparedSuite, options: EvaluateOptions): Promise<EvaluationBatch>;
