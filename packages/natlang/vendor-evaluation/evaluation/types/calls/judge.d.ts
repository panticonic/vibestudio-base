import type { NatlangRuntime } from '../runtime/runtime.js';
import { type ObservedEffect, type ValueSource } from './replay.js';
import type { CallRecord, Verdict } from './types.js';
/** What one execution did: its value or error, its service calls, the captures it wrote and the files it changed. */
export type Behavior = {
    value?: unknown;
    error?: string;
    effects: ObservedEffect[];
    captureWrites?: Record<string, unknown>;
    files?: {
        path: string;
        kind: string;
        text?: string;
    }[];
};
/** The behavior a recorded call shows, its descendants' effects included. */
export declare function recordedBehavior(store: ValueSource, record: CallRecord): Behavior;
/** Whether two behaviors are the same, and how they differ. Effects compare in order. */
export declare function compareBehaviors(reference: Behavior, candidate: Behavior): {
    equal: boolean;
    differences: string[];
};
/**
 * The verdict for a candidate (a case) against the reference (the agent): `equal` when they behave the same, else the
 * judge's `better`, `equivalent` or `worse`. Runs the judge in a task of `runtime` with compilations off.
 */
export declare function judge(runtime: NatlangRuntime, input: {
    instructions: string;
    signature: string;
    inputs: unknown;
    reference: Behavior;
    candidate: Behavior;
    annotations?: unknown[];
    seed: string;
}): Promise<{
    verdict: Verdict;
    differences: string[];
}>;
