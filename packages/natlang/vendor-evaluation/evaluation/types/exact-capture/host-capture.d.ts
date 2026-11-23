/**
 * Exact host capture as a filter over the call store (plans/TRACE_SPECIALIZATION.md §4): the teacher collector's
 * `host_capture` records (exact portable inputs and outputs of a call, bounded, explicitly incomplete otherwise),
 * rebuilt from a stored call instead of a separate recording path. Field for field what the native runtime emits inline
 * (native/runtime.ts captureExactValue), without the trace envelope (seq, observed_at, ...).
 */
type ValueRef = {
    complete: true;
    hash: string;
    bytes: number;
} | {
    complete: false;
    reason: string;
    hash?: string;
    bytes?: number;
};
type CallRecord = {
    call_id: string;
    parent_call_id: string | null;
    definition: {
        source: string | null;
        returns: string;
    };
    inputs: Record<string, ValueRef>;
    output: ValueRef | null;
    outcome: string;
};
export type HostCapture = {
    capture_kind: 'invocation_input' | 'invocation_output';
    call_id: string;
    parent_call_id: string | null;
    definition_source: string | null;
    name: string;
    complete: boolean;
    value?: unknown;
    bytes?: number;
    reason?: string;
    value_sha256?: string;
    result_type?: string | null;
    terminal_action_seq?: number | null;
    origin?: string;
};
/** What a store must answer for the view. */
export interface CaptureSource {
    call(callId: string): CallRecord | undefined;
    value(ref: ValueRef | null | undefined): unknown;
    events?(callId: string): Record<string, unknown>[] | undefined;
}
/**
 * The exact captures of a stored call: the named inputs (`inputArguments`; a name the call did not get is recorded as
 * missing) and, when `output` is set and the call succeeded, its result. `maxBytes` bounds a value as the inline
 * capture's budget does; the store's own bound (`maxValueBytes`) applies first.
 */
export declare function hostCaptures(store: CaptureSource, callId: string, spec?: {
    inputArguments?: readonly string[];
    output?: boolean;
    maxBytes?: number;
}): HostCapture[] | undefined;
export {};
