import type { ModelDriver } from '../runtime/runtime.js';
import type { ModelTurn, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
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
    private cost;
    snapshot(): BudgetLedger;
}
