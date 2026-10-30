import type { Candidate, ExecutorIdentity, InferencePolicy, ProgramDescriptor } from '../adaptation/types.js';
import type { NatlangRuntime, InvocationTrace, ModelDriver } from '../runtime/runtime.js';
import type { ModelTurnRequest, ModelTurn } from '../contracts.js';
export type Split = 'train' | 'validation' | 'test';
export type EvaluationCase<I = unknown, E = unknown> = {
    id: string;
    group: string;
    split: Split;
    input: I;
    expected?: E;
    slices?: readonly string[];
};
export type MetricResult = {
    quality: number;
    gates?: Record<string, boolean>;
    metrics?: Record<string, number>;
    feedback?: string;
    judge?: 'accepted' | 'rejected' | 'uncertain' | 'unavailable';
};
export type Usage = {
    modelCalls: number;
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;
};
export type EvaluationResult = {
    id: string;
    caseId: string;
    split: Split;
    status: 'scored' | 'candidate-invalid' | 'infrastructure-error' | 'cancelled';
    quality: number | null;
    gates: Record<string, boolean>;
    metrics: Record<string, number>;
    feedback: string;
    outcome: {
        kind: 'returned' | 'threw';
        value?: unknown;
        error?: {
            name: string;
            message: string;
            outcome?: string;
        };
    };
    observation?: unknown;
    observations?: Readonly<Record<string, unknown>>;
    coverage: readonly string[];
    usage: Usage;
    latencyMs: number;
    traces: readonly InvocationTrace[];
};
export type EvaluationBatch = {
    results: readonly EvaluationResult[];
    quality: number | null;
    gatesPassed: boolean;
    digest: string;
};
export type BudgetLimits = {
    maxRollouts: number;
    maxProposals: number;
    maxModelCalls: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxElapsedMs?: number;
    maxCost?: number;
    /** Dollar prices and provider-guaranteed upper bounds, required for hard monetary caps. */
    pricing?: {
        inputPerMillion: number;
        outputPerMillion: number;
    };
    requestBounds?: {
        maxInputTokens: number;
        maxOutputTokens: number;
    };
};
export type FixtureContext = {
    runtime: NatlangRuntime;
    program: ProgramDescriptor;
    seed: number;
    signal: AbortSignal;
    observations: import('./fixtures.js').FixtureObservationStore;
    judge(request: ModelTurnRequest): Promise<ModelTurn>;
    loadFreshProgram(): Promise<Record<string, unknown>>;
};
export type EvaluationFixture = {
    execute(): unknown | Promise<unknown>;
    observe?(result: unknown, outcome: EvaluationResult['outcome']): unknown | Promise<unknown>;
    dispose?(): unknown | Promise<unknown>;
};
export type EvaluationSuite<I = unknown, E = unknown> = {
    id: string;
    program: {
        root: string;
        id: string;
        entry: string;
        guidance?: string;
    };
    components: readonly string[] | 'lambda-only' | 'guidance-only' | 'joint';
    cases: string | readonly EvaluationCase<I, E>[];
    models?: {
        executor: string;
        reflection?: string;
        judge?: string;
    };
    executorIdentity: ExecutorIdentity;
    policy?: InferencePolicy;
    budget: BudgetLimits;
    services?: ProgramDescriptor['services'];
    systemPrompt?: string;
    fixture: {
        create(testCase: EvaluationCase<I, E>, context: FixtureContext): EvaluationFixture | Promise<EvaluationFixture>;
    };
    score(testCase: EvaluationCase<I, E>, observation: unknown, outcome: EvaluationResult['outcome']): MetricResult | Promise<MetricResult>;
    feedback?: (testCase: EvaluationCase<I, E>, result: EvaluationResult) => unknown;
    requiredGates?: readonly string[];
    selection?: {
        tieBreak?: 'baseline' | 'modelCalls' | 'latency' | 'cost';
        maxMeanLatencyMs?: number;
        maxModelCalls?: number;
        maxCost?: number;
    };
};
export type PreparedSuite = {
    suite: EvaluationSuite;
    moduleURL: string;
    cases: readonly EvaluationCase[];
    program: ProgramDescriptor;
    suiteHash: string;
    components: readonly string[];
    compiledEntry: string;
};
export type EvaluateOptions = {
    split?: Split;
    caseIds?: readonly string[];
    candidate?: Candidate;
    seed?: number;
    replicate?: number;
    driver: ModelDriver;
    signal?: AbortSignal;
    timeoutMs?: number;
    retries?: number;
    runId?: string;
    judge?: ModelDriver;
    gateway?: import('./usage.js').UsageGateway;
};
