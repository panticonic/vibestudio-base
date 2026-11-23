import type { Candidate, ComponentDescriptor, AdaptationArtifact } from '../adaptation/types.js';
import type { EvaluationBatch, BudgetLimits } from '../evaluation/types.js';
import type { ModelDriver } from '../runtime/runtime.js';
import type { BudgetLedger, UsageGateway } from '../evaluation/usage.js';
export type ValidationResult = {
    valid: boolean;
    feedback?: string;
};
export type EvaluationContext = {
    runId: string;
    evaluationId: string;
    seed: number;
    signal?: AbortSignal;
    gateway: UsageGateway;
};
export interface OptimizationTarget {
    components(): readonly ComponentDescriptor[];
    validate(candidate: Candidate): Promise<ValidationResult>;
    evaluate(candidate: Candidate, cases: readonly string[], context: EvaluationContext): Promise<EvaluationBatch>;
    feedback(batch: EvaluationBatch, keys: readonly string[]): Promise<readonly unknown[]>;
}
export type OptimizationOptions = {
    executor: ModelDriver;
    reflection: ModelDriver;
    strategy?: 'gepa' | 'reflection';
    judge?: ModelDriver;
    reflectionIdentity?: import('../adaptation/types.js').ExecutorIdentity;
    judgeIdentity?: import('../adaptation/types.js').ExecutorIdentity;
    seed?: number;
    out?: string;
    runId?: string;
    signal?: AbortSignal;
    budget?: BudgetLimits;
    minibatchSize?: number;
    maxPopulation?: number;
    maxHistory?: number;
    maxRepairs?: number;
    target?: OptimizationTarget;
    dependencies?: Readonly<Record<string, readonly string[]>>;
    finalTest?: boolean;
    /** The mode of each pluggable search policy (chooseParent, chooseMove, chooseComponents): crisp (default), nl or shadow. */
    policies?: import('./policies.js').ComponentPolicySettings;
    holdoutReservation?: import('../evaluation/usage.js').RequestReservation;
    progress?: (event: Record<string, unknown>) => void;
};
export type SearchCandidate = {
    id: string;
    value: Candidate;
    parents: readonly string[];
    train: EvaluationBatch;
    validation: EvaluationBatch;
};
/** What an experiment decided before its edit; journaled in the checkpoint so a resumed run reuses it. */
export type ExperimentPlan = {
    iteration: number;
    parent: string;
    partner: string;
    selected: string;
    keys: string[];
    mini: string[];
    compose: boolean;
    chose: {
        chooseParent: string;
        chooseComponents: string;
        chooseMove: string;
    };
};
export type SearchState = {
    schema: 'natlang.adaptation-run/v1';
    engine: string;
    runId: string;
    suiteHash: string;
    programHash: string;
    optionsHash: string;
    strategy: 'gepa' | 'reflection';
    seed: number;
    rng: number;
    iteration: number;
    population: SearchCandidate[];
    incumbent: string;
    baseline: SearchCandidate;
    selector: Record<string, {
        proposals: number;
        accepts: number;
        lastAcceptIter: number;
        stagnation: number;
    }>;
    history: Record<string, unknown>[];
    historyTruncated?: number;
    plan?: ExperimentPlan;
    ledger: BudgetLedger;
    selected: boolean;
    lockedTest?: EvaluationBatch;
    stopReason?: 'completed' | 'budget-exhausted' | 'cancelled' | 'coverage-gap' | 'infrastructure-error';
};
export type OptimizationResult = {
    artifact: AdaptationArtifact;
    report: Record<string, unknown>;
    state: SearchState;
    directory: string;
};
