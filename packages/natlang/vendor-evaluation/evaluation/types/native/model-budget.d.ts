/** Task-wide model budget. Reservations serialize contending graph work without lending the same allowance twice. */
export declare class ModelBudget {
    readonly maxRequests?: number | undefined;
    readonly maxTokens?: number | undefined;
    private requests;
    private tokens;
    private reservedRequests;
    private reservedTokens;
    private requestsUnknown;
    private tokensUnknown;
    private waiters;
    constructor(maxRequests?: number | undefined, maxTokens?: number | undefined);
    private wait;
    private wake;
    hasRemaining(): boolean;
    /** Null records unavailable usage; zero always means a measured zero. */
    usage(): {
        requests: number | null;
        tokens: number | null;
    };
    /** A forced source-text writer performs a request but samples no completion tokens. */
    reserveForcedText(signal?: AbortSignal): Promise<boolean>;
    /** Reserve one request and its maximum completion tokens. */
    reserve(requested: number | null, signal?: AbortSignal): Promise<{
        limit: number | null;
        finish: (used?: number) => void;
    } | undefined>;
    /** Reserve the remaining graph allowance for a multi-write operation such as native view. */
    reserveBatch(signal?: AbortSignal): Promise<{
        maxRequests: number | null;
        maxTokens: number | null;
        finish: (usage?: {
            requests: number;
            tokens: number;
        }) => void;
    } | undefined>;
}
