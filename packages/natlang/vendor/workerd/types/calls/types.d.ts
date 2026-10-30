/**
 * Call records (`natlang.calls/1`, plans/TRACE_SPECIALIZATION.md §3): what the runtime keeps of every natlang call so
 * calls can be queried, replayed, and compiled into crisp cases. Values are content-addressed; a record names them by
 * hash and the store holds the bytes.
 */
export declare const CALLS_VERSION = "natlang.calls/1";
/** A recorded value: its exact JSON (by hash) when it is portable and within the per-value bound, else what is known. */
export type ValueRef = {
    complete: true;
    hash: string;
    bytes: number;
} | {
    complete: false;
    reason: 'oversize' | 'nonportable' | 'excluded';
    hash?: string;
    bytes?: number;
    type?: string;
    preview?: string;
};
/** One service call made during a call (by the agent's eval code, or by a crisp case). */
export type EffectRecord = {
    order: number;
    service: string;
    method: string;
    args: ValueRef;
    result?: ValueRef;
    /** Whether the method returned a promise, so a replay answers the same way. */
    async?: boolean;
    error?: string;
    by: 'agent' | 'crisp';
};
/** Which executor produced a call's result. `crisp-agent`: a case failed and the agent finished the call. */
export type ExecutorKind = 'agent' | 'crisp' | 'crisp-agent';
export type SiteKind = 'named' | 'inline' | 'iterate' | 'internal';
/** The identity of what ran: `key` is the definition revision compilations are keyed by (§7.3). */
export type DefinitionIdentity = {
    id: string;
    name: string;
    source: string | null;
    key: string;
    interface: string;
    site: SiteKind;
    template?: string;
    subtype: 'function' | 'directory-reducer';
    params: {
        name: string;
        type: string;
        optional?: boolean;
    }[];
    returns: string;
    declaredParameters?: true;
    /** The instructions as run, and the type aliases in scope: enough to rebuild the definition offline when its source cannot be loaded. */
    instructions: ValueRef;
    types: Record<string, string>;
    readout?: string;
    /**
     * A representation-generic result (`generic: { R: T | Neuralese<T> }`) and the instance this call ran: with the
     * definition's id, enough to run the same call again at either representation (`invokeAt`). `returns` and `key` are
     * the instance's.
     */
    generic?: {
        name: string;
        constraint: string;
    };
    representation?: import('../native/representation.js').Representation;
};
export type CallCost = {
    model_requests: number;
    tokens_in: number;
    tokens_out: number;
    wall_ms: number;
    turns: number;
    evals: number;
};
/**
 * Whether a recorded agent call shows what a model did: it spent model tokens, and its executor declared a model
 * (scripted test agents and other undeclared drivers are recorded as `undeclared:<name>`). Only such calls are
 * evidence for compilations, shadow comparisons and audits.
 */
export declare function isModelEvidence(record: {
    executor: {
        model_id: string | null;
    };
    cost: CallCost;
}): boolean;
export type FolderRecord = {
    mode: 'apply' | 'direct';
    changes: {
        path: string;
        kind: string;
        after?: ValueRef;
    }[];
};
export type CallRecord = {
    version: typeof CALLS_VERSION;
    call_id: string;
    parent_call_id: string | null;
    /** Which eval of the parent call was running when this call started (0-based), when a parent eval started it. */
    parent_action_index: number | null;
    task_id: string;
    program_id: string | null;
    build_hash: string | null;
    /** A root run's logical name (`curriculum-reference`, `native-run`): runs of one kind share it, each under its own call ID. */
    run_label?: string;
    /** The program's directory on this machine, when known: where offline work reloads the definition from. */
    program_root: string | null;
    definition: DefinitionIdentity;
    executor: {
        kind: ExecutorKind;
        model_id: string | null;
        model_revision: string | null;
        case_hash?: string;
        /** For `crisp-agent`: why the case stopped. */
        case_error?: string;
    };
    inputs: Record<string, ValueRef>;
    captures: Record<string, ValueRef>;
    capture_writes: {
        name: string;
        after: ValueRef;
    }[];
    output: ValueRef | null;
    outcome: string;
    detail: string;
    started_at: string;
    ended_at: string;
    effects: EffectRecord[];
    folder: FolderRecord | null;
    /** The eval programs the agent ran, in order (successful and failed), and the hash of their normalized form. */
    approach: {
        evals: string[];
        hash: string | null;
    };
    cost: CallCost;
    /** Typed features of the inputs (§5.2), computed when the call is recorded. */
    features: Record<string, string | number | boolean>;
    /** Set on audit and shadow runs: the call they re-ran or checked. */
    audit_of?: string | null;
    events: ValueRef | null;
};
/** Machine settings (`<store>/config.json`, environment overrides). */
export type CallStoreSettings = {
    /** Largest value recorded exactly, as JSON bytes. */
    maxValueBytes: number;
    /** Store size at which eviction starts. */
    maxStoreBytes: number;
    /** Free space the store leaves on its filesystem: below it, eviction starts whatever the store's size. */
    minFreeBytes: number;
    /** How far compilations may go on this machine. */
    specialization: 'off' | 'shadow' | 'on';
    /** Fraction of crisp-served calls queued for an offline audit through the agent. */
    auditRate: number;
    /** Largest share of `worse` verdicts (and of hand-offs) a case may have and stay accepted or active. */
    acceptanceBound: number;
    /** Comparisons a case needs (held-out replays plus shadow checks) before it is promoted to active. */
    promotionComparisons: number;
    /**
     * Of those, comparisons on live calls (shadow replays and audits of calls made after the compilation): replays of the
     * calls a case was written from share their context, so a case also has to hold on calls it has not seen.
     */
    promotionLiveComparisons: number;
    /** Calls of one definition revision before the specializer looks at it. */
    minCalls: number;
    /**
     * Who decides promotion and demotion of cases and tiers from their evidence (calls/evidence.ts): `crisp` the fixed rule
     * above, applied as evidence arrives; `nl` the natural-language policy, decided by the specializer loop, never per call;
     * `shadow` the crisp rule serves and the loop also asks the natural-language policy and records whether they agree.
     */
    promotionPolicy: 'crisp' | 'nl' | 'shadow';
    /** Which definitions the specializer looks at (applications/specializer): `crisp` the count rule, `nl` worthLooking.nl, `shadow` both, crisp serves. */
    targetPolicy: 'crisp' | 'nl' | 'shadow';
    /** The stored text of a decline: `crisp` the joined group lines, `nl` summarizeDecline.nl, `shadow` both, crisp serves. No decision depends on it. */
    declinePolicy: 'crisp' | 'nl' | 'shadow';
};
export declare const DEFAULT_SETTINGS: CallStoreSettings;
export type CaseTier = 'shadow' | 'active' | 'demoted' | 'disabled';
export type CaseRole = 'group' | 'training' | 'held-out' | 'counterexample' | 'shadow' | 'audit' | 'served' | 'handed-off';
export type Verdict = 'equal' | 'better' | 'equivalent' | 'worse' | 'diverged';
export type CaseStats = {
    hash: string;
    compilation_id: string;
    position: number;
    tier: CaseTier;
    served: number;
    handed_off: number;
    compared: number;
    worse: number;
    better: number;
    audited: number;
    audit_worse: number;
    live_compared: number;
    live_worse: number;
    created_at: string;
    promoted_at: string | null;
    demoted_at: string | null;
    note: string | null;
};
export type CompilationRow = {
    id: string;
    definition_key: string;
    definition_id: string;
    definition_name: string;
    definition_source: string | null;
    interface_hash: string;
    program_root: string | null;
    folder_hash: string;
    parent_id: string | null;
    created_at: string;
    status: 'current' | 'superseded' | 'disabled';
    files: Record<string, string>;
};
export type DeclineReason = 'no-clusters' | 'semantic' | 'unstable' | 'effects' | 'not-worth-it' | 'budget';
export type DeclineRow = {
    definition_key: string;
    definition_id: string;
    reason: DeclineReason;
    why: string;
    calls_at_decline: number;
    created_at: string;
};
