import type { ModelDriver } from '../runtime/runtime.js';
import type { DecisionRequest, DecisionScorer, DecisionScores, ModelTurn, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
import type { BudgetLimits, Usage } from './types.js';
export declare class BudgetExhausted extends Error {
    readonly dimension: string;
    constructor(dimension: string);
}
export type ModelRole = 'executor' | 'reflection' | 'judge';
export type RequestReservation = Partial<Record<'modelCalls' | 'inputTokens' | 'outputTokens' | 'cost', number>>;
export type BudgetLedger = {
    rollouts: number;
    proposals: number;
    usage: Usage;
    elapsedMs: number;
    unknownRequests: number;
    overrun: readonly string[];
    roles?: Partial<Record<ModelRole, Usage>>;
    reserved?: {
        modelCalls: number;
        inputTokens: number;
        outputTokens: number;
        cost: number;
    };
};
/** A backend that cannot score replies declines with this error before doing any work; the call runs the tool loop instead. */
export declare const decisionDeclined: (error: unknown) => boolean;
/** What a decision readout used: its prompt tokens as the scorer reports them, and no generated tokens. */
export declare const decisionUsage: (scores: DecisionScores) => {
    prompt_tokens?: number;
    completion_tokens: number;
};
export declare class UsageGateway {
    readonly limits: BudgetLimits;
    readonly ledger: BudgetLedger;
    private readonly started;
    private inFlight;
    private reservedInput;
    private reservedOutput;
    private reservedCost;
    private protectedCapacity;
    protect(capacity: RequestReservation): void;
    onUpdate?: (ledger: BudgetLedger) => void;
    constructor(limits: BudgetLimits, previous?: BudgetLedger);
    check(signal?: AbortSignal): void;
    elapsed(): number;
    reserve(kind: 'rollouts' | 'proposals', count?: number, signal?: AbortSignal): void;
    /** One metered request; `options` (the driver's turn options, such as `onDelta`) are passed to the driver. */
    request(driver: ModelDriver, request: ModelTurnRequest, signal?: AbortSignal, role?: ModelRole, options?: ModelTurnOptions): Promise<ModelTurn>;
    /**
     * One metered decision readout (contracts.ts `DecisionRequest`): a model request like a turn, so it counts against
     * the same limits. It generates nothing, so its output bound is zero; its input is the `prompt_tokens` the scorer
     * reports (unknown when it does not, as for a turn).
     */
    score(scorer: DecisionScorer, request: DecisionRequest, signal?: AbortSignal, role?: ModelRole): Promise<DecisionScores>;
    /** `driver` as a driver of this gateway's `role`: its turns and, where it scores replies, its decisions are metered. */
    driver(driver: ModelDriver, role: ModelRole, signal?: AbortSignal): ModelDriver;
    private meter;
    private cost;
    snapshot(): BudgetLedger;
}
