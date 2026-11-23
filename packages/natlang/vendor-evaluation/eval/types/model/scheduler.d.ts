/**
 * One scheduler per model backend (plans/BATCHED_EXECUTION.md §3.1). Every request for a backend waits here, in one
 * queue, instead of in a per-call-site limit. The scheduler decides when a request is sent and in what company:
 *
 * - It sends up to `maxConcurrent` requests at once. With a server that batches continuously (llama.cpp
 *   `--parallel N`, vLLM) that is the batch.
 * - Requests that become ready together are released together, in one coalescing window, and share a batch id.
 * - A turn of a call that is already running is served before the first turn of a new call, so started work finishes,
 *   frees its slot and KV, and a program waiting on one result stays fast. The scheduler recognises a running call
 *   by the invocation id the request carries (`ModelTurnRequest.invocation_id`): no turn counter is threaded through
 *   the runtime.
 * - Within a priority class, requests with the same prompt prefix (same system message) are sent adjacent, so the
 *   server's prefix cache or a slot with a matching prompt is reused.
 * - A queued request is cancelled by its AbortSignal, or all of an invocation's requests by `cancel`.
 *
 * `requestLimit` (chat-completion.ts) stays as the plain FIFO limit. A scheduler with `priority: false`, `adjacency:
 * false` and `coalesceMs: 0` admits requests exactly as a request limit of the same size does (tested).
 */
import type { ChatRequestMeta, ChatTransport, RequestLimit } from './chat-completion.js';
type Json = Record<string, unknown>;
/** How a backend turns concurrent requests into forward batches. */
export type BatchingMode = 
/** The server batches concurrent requests itself (llama.cpp `--parallel N`, vLLM, the Neuralese server). */
'server-continuous'
/** One request can carry many prompts (a scoring endpoint); the scheduler packs. Turns behave as continuous. */
 | 'explicit-batch'
/** Remote APIs where batching buys nothing: the scheduler only limits concurrency. */
 | 'serial';
export type BackendCapabilities = {
    batching: {
        mode: BatchingMode;
        maxConcurrent: number;
    };
};
/** What the scheduler records about one request, delivered to the request's `onScheduled` hook when it is sent. */
export type ScheduleInfo = {
    batch_id: string;
    /** Requests released together with this one. */
    batch_size: number;
    /** Requests in flight on the backend when this one was sent, itself included. */
    in_flight: number;
    /** Time spent waiting in the scheduler's queue. */
    queue_wait_ms: number;
    priority: 'running' | 'new';
};
export type SchedulerOptions = {
    mode?: BatchingMode;
    /** Requests in flight at once. Infinity means no limit. */
    maxConcurrent?: number;
    /**
     * How long a ready request waits for company before the queue is released. Default 2 ms for explicit-batch
     * backends, which pack what arrives together, and 0 (the next timer tick) otherwise: continuous servers batch
     * by themselves, and the window only decides ordering when requests queue.
     */
    coalesceMs?: number;
    /** Serve turns of running calls before new calls. Default true. */
    priority?: boolean;
    /** Send requests with the same prompt prefix next to each other. Default true except in serial mode. */
    adjacency?: boolean;
    /** Time source, for tests. */
    now?: () => number;
    /** Timer source for the coalescing window, for tests that run on a virtual clock. Default: setTimeout and clearTimeout. */
    timers?: {
        set(run: () => void, ms: number): unknown;
        clear(handle: unknown): void;
    };
};
export type OccupancySummary = {
    requests: number;
    batches: number;
    maxInFlight: number;
    meanInFlight: number;
    meanBatchSize: number;
    queueWaitMs: {
        mean: number;
        p50: number;
        p95: number;
        max: number;
    };
    running: number;
    fresh: number;
};
export type Scheduler = {
    readonly capabilities: BackendCapabilities;
    /** Wait for a slot. Resolves with a release function; rejects if `signal` aborts or the request is cancelled. */
    acquire(meta?: ChatRequestMeta, signal?: AbortSignal): Promise<() => void>;
    /** A transport whose requests wait here. A streamed reply keeps its slot until it has been read to the end. */
    transport(transport: ChatTransport): ChatTransport;
    /** The scheduler as a plain request limit (no priority information), for code written against `RequestLimit`. */
    asRequestLimit(): RequestLimit;
    /** Change the concurrency, for example once a managed server has said how many slots it started. */
    setMaxConcurrent(size: number): void;
    /** Reject the queued requests of one invocation. Requests already sent run to their end. */
    cancel(invocationId: string, reason?: unknown): number;
    /** Reject every queued request. */
    close(reason?: unknown): void;
    readonly queued: number;
    readonly inFlight: number;
    occupancy(): OccupancySummary;
    /** Recent request records, newest last. */
    records(): readonly ScheduleInfo[];
};
/** A cheap stable key of a request's shared prefix: its leading system message. */
export declare function prefixKey(body: Json | undefined): string;
export declare function createScheduler(options?: SchedulerOptions): Scheduler;
/** The scheduler for a backend, from a profile's `concurrency` and `batching` settings. */
export declare function schedulerForSettings(settings: {
    concurrency?: number;
    batching?: {
        mode?: BatchingMode;
        maxConcurrent?: number;
        coalesceMs?: number;
        priority?: boolean;
    };
}, fallback?: {
    maxConcurrent?: number;
}): Scheduler;
export {};
