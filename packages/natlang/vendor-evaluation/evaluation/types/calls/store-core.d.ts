import type { IterationStatisticsStore } from '../runtime/iterate.js';
import { type EvidenceSummary, type PromotionDecision } from './evidence.js';
import { type CallRecord, type CallStoreSettings, type CaseRole, type CaseStats, type CaseTier, type CompilationRow, type DeclineReason, type DeclineRow, type ValueRef, type Verdict } from './types.js';
export type SqlValue = string | number | bigint | null | Uint8Array;
/** The part of a synchronous SQLite binding the store uses (node:sqlite's DatabaseSync has it). */
export interface SqlDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
        run(...params: SqlValue[]): unknown;
        get(...params: SqlValue[]): unknown;
        all(...params: SqlValue[]): unknown[];
    };
    close(): void;
}
/** Where a store keeps what is not rows, and what it knows of its surroundings. */
export interface StoreMedium {
    putBlob(hash: string, text: string): void;
    blob(hash: string): string | undefined;
    deleteBlob(hash: string): void;
    readConfig(): Partial<CallStoreSettings>;
    writeConfig(config: Partial<CallStoreSettings>): void;
    /** Free bytes where the store lives; Infinity when unknown. */
    freeBytes(): number;
    /** Bytes the database itself takes. */
    databaseBytes(): number;
    /** A specialization mode set from outside the store (Node: NATLANG_SPECIALIZATION, supplied by the machine-store module). */
    modeOverride(): string | undefined;
    /** This process, for the rows of the calls it runs. */
    readonly process: {
        pid: number | null;
        scope: string;
    };
    /** Whether the process that wrote a running row is known to be gone. */
    gone(pid: number | null, scope: string | null): boolean;
}
export declare const byteLength: (text: string) => number;
export type CallSummary = {
    call_id: string;
    parent_call_id: string | null;
    definition_id: string;
    definition_name: string;
    definition_key: string;
    definition_source: string | null;
    executor: string;
    case_hash: string | null;
    outcome: string;
    started_at: string;
    wall_ms: number;
    tokens_in: number;
    tokens_out: number;
    approach_hash: string | null;
    program_root: string | null;
    audit_of: string | null;
};
export type CallFilter = {
    definition?: string;
    key?: string;
    source?: string;
    outcome?: string;
    executor?: string;
    caseHash?: string;
    since?: string;
    program?: string;
    limit?: number;
    after?: string;
    audits?: boolean;
};
export type HotDefinition = {
    definition_key: string;
    definition_id: string;
    definition_name: string;
    definition_source: string | null;
    program_root: string | null;
    calls: number;
    agent_calls: number;
    crisp_calls: number;
    tokens: number;
    wall_ms: number;
    last_at: string;
};
export type FindingInput = {
    definitionKey: string;
    definitionId: string;
    definitionName: string;
    definitionSource: string | null;
    kind: string;
    summary: string;
    detail?: unknown;
};
export type FindingRow = {
    id: number;
    fingerprint: string;
    definition_key: string;
    definition_id: string;
    definition_name: string;
    definition_source: string | null;
    kind: string;
    summary: string;
    detail: unknown;
    seen: number;
    status: string;
    created_at: string;
    updated_at: string;
};
export type SavingsRow = {
    definition_key: string;
    definition_name: string;
    definition_source: string | null;
    agent_calls: number;
    served: number;
    agent_tokens_per_call: number;
    agent_ms_per_call: number;
    crisp_ms_per_call: number;
    saved_tokens: number;
    saved_ms: number;
    spent_tokens: number;
    spent_ms: number;
};
export type AuditJob = {
    id: number;
    kind: 'audit' | 'shadow';
    case_hash: string;
    call_id: string;
    enqueued_at: string;
};
/** The call store's `VerdictCache` (native/refinement.ts), with a count and a clear for tools. */
export type RefinementVerdictStore = import('../native/refinement.js').VerdictCache & {
    count(): number;
    clear(): void;
};
/**
 * A call record store. Under Node, open the machine's with `CallStore.open(root)` (store.ts; one instance per root per
 * process); in the browser the call-store worker builds one over OPFS.
 */
export declare class CallStore {
    readonly root: string;
    readonly db: SqlDatabase;
    readonly medium: StoreMedium;
    /** Opens a store at a path; set by the Node store module (store.ts). */
    static opener?: (root: string, options?: {
        mode?: () => string | undefined;
    }) => CallStore;
    static open(root: string, options?: {
        mode?: () => string | undefined;
    }): CallStore;
    /** Called when the store closes (the Node module forgets its instance). */
    onClose?: () => void;
    private writes;
    private settingsCache?;
    constructor(root: string, db: SqlDatabase, medium: StoreMedium);
    /** Calls left `running` by a process that is gone (as the medium knows it) become `interrupted`. */
    markInterrupted(): number;
    close(): void;
    /** Machine settings: defaults, then the store's config, then the medium's mode override (Node: NATLANG_SPECIALIZATION). Re-read every 5 s. */
    settings(): CallStoreSettings;
    writeSettings(changes: Partial<CallStoreSettings>): CallStoreSettings;
    /** Store `text` under its SHA-256; returns the hash. Existing blobs are not rewritten. */
    putBlob(text: string, hash?: string): string;
    blob(hash: string): string | undefined;
    /** The value a complete reference names, or `undefined` when it is incomplete or evicted. */
    value(ref: ValueRef | null | undefined): unknown;
    /** Store one call record. `blobs` holds the text of every complete value the record references (by hash). */
    record(record: CallRecord, blobs: ReadonlyMap<string, string>, events?: string): void;
    /** A row for a call that has started, so running calls show in listings; `record` replaces it when the call ends. */
    begin(row: {
        callId: string;
        parentCallId: string | null;
        parentActionIndex: number | null;
        taskId: string;
        programId: string | null;
        programRoot: string | null;
        definition: {
            id: string;
            name: string;
            source: string | null;
            key: string;
            interface: string;
            site: string;
        };
        modelId: string | null;
        startedAt: string;
        auditOf: string | null;
        runLabel?: string;
    }): void;
    /** Remove the row of a call that started and will not be recorded. */
    discard(callId: string): void;
    /** The trace events so far of a running call (written every so often while it runs). */
    progress(callId: string, events: string): void;
    call(callId: string): CallRecord | undefined;
    /** The call's trace events (`natlang.trace`), when they have not been evicted. */
    events(callId: string): Record<string, unknown>[] | undefined;
    /** Calls matching `filter`, newest first. `after` continues from a call ID of an earlier page. */
    calls(filter?: CallFilter): CallSummary[];
    /** Definition revisions by volume or cost since `since`. */
    hot(options?: {
        since?: string;
        program?: string;
        by?: 'calls' | 'tokens' | 'wall_ms';
        limit?: number;
    }): HotDefinition[];
    /** Successful agent calls of a definition revision, oldest first: the specializer's evidence. */
    agentCalls(definitionKey: string, limit?: number): CallSummary[];
    /** Calls started by a call, oldest first. */
    children(callId: string): CallSummary[];
    countCalls(definitionKey: string): number;
    /** Attach evidence to a call; it is pinned unless `pin` is false (routine annotations such as evaluation scores). */
    annotate(callId: string, kind: string, value: unknown, source?: string, pin?: boolean): void;
    /** Tier events (calls/tiers.ts) in order, with the cost of the call each is attached to. */
    tierRows(): {
        call_id: string;
        value: unknown;
        definition_name: string | null;
        executor: string | null;
        model_id: string | null;
        tokens_in: number;
        tokens_out: number;
        wall_ms: number;
    }[];
    annotations(callId: string): {
        kind: string;
        value: unknown;
        source: string | null;
        created_at: string;
    }[];
    /** Keep a call (and its values) when the store evicts. */
    pin(callId: string, pinned?: boolean): void;
    totalBytes(): number;
    /** The store's bound now: its size limit, lowered so the filesystem keeps `minFreeBytes` free. */
    bound(): number;
    /**
     * Bring the store under its bound: first the event streams of unpinned calls, oldest first; then whole unpinned calls.
     * A call is pinned when it is marked so, annotated, or linked to a case. Returns the bytes freed.
     * A finite work limit bounds inspected blob candidates and processed call rows; repeated passes resume the orphan
     * cursor. Automatic writes use that mode so a large historical store cannot stall the executing model. Explicit
     * eviction defaults to completing all eligible work needed for the bound.
     */
    evict(maxBytes?: number, workLimit?: number): number;
    /** Delete affected blobs only when no call or compilation still references them. */
    private collectHashes;
    /** Bumped whenever compilations or case tiers change, so runtimes know to reload. */
    version(): number;
    private bump;
    /** The compilation in use for a definition revision, with its files and cases. */
    currentCompilation(definitionKey: string): (CompilationRow & {
        cases: CaseStats[];
    }) | undefined;
    compilation(id: string): (CompilationRow & {
        cases: CaseStats[];
    }) | undefined;
    private withFiles;
    cases(compilationId: string): CaseStats[];
    caseStats(hash: string): CaseStats | undefined;
    /** Compilations, newest first. */
    compilations(filter?: {
        definition?: string;
        program?: string;
        status?: string;
        limit?: number;
    }): Omit<CompilationRow, 'files'>[];
    /**
     * Store a compilation folder as the current one for its definition revision. Cases whose hash the previous
     * compilation already had keep their tier and counts; new cases start in shadow. Returns the compilation ID.
     */
    saveCompilation(input: {
        definitionKey: string;
        definitionId: string;
        definitionName: string;
        definitionSource: string | null;
        interfaceHash: string;
        programRoot: string | null;
        files: Record<string, string>;
        caseHashes: string[];
        links?: {
            caseHash: string;
            callId: string;
            role: CaseRole;
            verdict?: Verdict | null;
        }[];
    }): string;
    setCompilationStatus(id: string, status: 'current' | 'superseded' | 'disabled'): void;
    linkCase(caseHash: string, callId: string, role: CaseRole, verdict?: Verdict | null): void;
    caseCalls(caseHash: string, role?: CaseRole, limit?: number): {
        call_id: string;
        role: CaseRole;
        verdict: Verdict | null;
        created_at: string;
    }[];
    /** The cases a call is linked to (served by, learned from, audited by, ...). */
    callCases(callId: string): {
        case_hash: string;
        role: CaseRole;
        verdict: Verdict | null;
    }[];
    /** Count a served call or a hand-off for a case, and review its tier. */
    caseServed(caseHash: string, callId: string, handedOff: boolean): void;
    /** Record a comparison of a case against the agent (held-out replay, shadow, audit) and review its tier. */
    caseVerdict(caseHash: string, callId: string, role: 'held-out' | 'shadow' | 'audit', verdict: Verdict): void;
    /** A case's evidence in the shape every promotion policy judges (calls/evidence.ts), with its latest comparisons for recency. */
    caseSummary(caseHash: string): EvidenceSummary | undefined;
    /**
     * Promotion and demotion by evidence (§6.2), by the shared rule `crispPolicy` (calls/evidence.ts), applied as evidence
     * arrives. Under `promotionPolicy: 'nl'` the natural-language policy decides instead, from the specializer loop
     * (`reviewPromotions`, runtime/promotion.ts), so nothing happens here.
     */
    reviewTier(caseHash: string): CaseTier | undefined;
    /** Apply a policy's decision about a case; `by` names the policy in the case's note. */
    decideTier(summary: EvidenceSummary, verdict: PromotionDecision, by?: string): CaseTier;
    setTier(caseHash: string, tier: CaseTier, note?: string): void;
    decline(input: {
        definitionKey: string;
        definitionId: string;
        reason: DeclineReason;
        why: string;
        calls: number;
    }): void;
    declineFor(definitionKey: string): DeclineRow | undefined;
    declines(limit?: number): DeclineRow[];
    /** Record a finding; the same finding again (definition, kind, summary) updates it and counts it. */
    finding(input: FindingInput): void;
    /** Findings, newest first: open ones unless `all`. */
    findings(filter?: {
        definition?: string;
        all?: boolean;
        limit?: number;
    }): FindingRow[];
    /** Mark a finding acknowledged (it stays, and comes back open only if it is found again with a new summary). */
    acknowledgeFinding(id: number): boolean;
    /** Tokens and time the specializer spent on a definition revision (writing, verifying, shadow replays, audits). */
    spent(definitionKey: string, activity: string, tokens: number, wallMs: number): void;
    /**
     * Per definition revision with a compilation or spend: calls served by cases, what the agent costs per call (the
     * average of its successful calls), the tokens and time saved by serving, and what specializing has cost.
     */
    savings(filter?: {
        definition?: string;
    }): SavingsRow[];
    enqueue(kind: 'audit' | 'shadow', caseHash: string, callId: string): void;
    pendingJobs(limit?: number): AuditJob[];
    finishJob(id: number, status: 'done' | 'skipped' | 'failed', verdict?: Verdict | null, detail?: string): void;
    jobs(caseHash?: string, limit?: number): (AuditJob & {
        status: string;
        verdict: string | null;
        detail: string | null;
    })[];
    /** iterateOn site statistics kept in the store (runtime/iterate.ts), shared by every runtime on the machine. */
    iterationStatistics(): IterationStatisticsStore;
    private statistics?;
    /**
     * Refinement verdicts (`Is<T, P>`, native/refinement.ts) kept with the machine's records: P(true) by content key
     * (value hash, normalized predicate, judge id), so a value is not judged twice in any process. The table is created on
     * open like every other, so existing stores gain it without a version bump.
     */
    refinementVerdicts(): RefinementVerdictStore;
    private verdicts?;
    /** Bytes of the database and blobs (for `natlang traces status`). */
    diskBytes(): number;
}
