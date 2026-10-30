/** One service call, as recorded: requested, then completed or failed. */
export type EffectEvent = {
    phase: 'requested' | 'completed' | 'failed';
    service: string;
    method: string;
    args?: unknown;
    result?: unknown;
    error?: string;
    /** Pairs a request with its completion. */
    seq?: number;
    /** The exact arguments and result, for call records (§3.1). Traces keep only the previews above. */
    exact?: {
        args?: unknown[];
        result?: unknown;
        async?: boolean;
    };
};
export declare const isRecording: (services: object) => boolean;
/** Only recorder-owned proxies have this declared selected-execution surface. */
export declare function selectedServiceSurface(value: unknown): unknown;
/**
 * A service's external effects that must happen once: `{ [ONCE_EFFECTS]: ['send'], send(...) {...} }`. A call with the
 * same arguments as an earlier one on the same service object (an executor re-running eval code, a parent calling a
 * function again) returns the earlier result instead of acting again; a call that failed may run again. The service
 * object's lifetime is the scope: hand a fresh one to each unit of work that may repeat the effect deliberately.
 */
export declare const ONCE_EFFECTS: unique symbol;
/**
 * Wrap services so each method call is recorded as an effect. Objects are wrapped one level deep
 * per property access; the original receiver is preserved.
 */
export declare function recordingServices<T extends Record<string, unknown>>(services: T, emit: (event: EffectEvent) => void): T;
