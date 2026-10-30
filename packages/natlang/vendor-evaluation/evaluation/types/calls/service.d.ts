/**
 * The call store as a typed host service (§3.5): natlang programs (the specializer, the improver, an application's own
 * diagnosis) read records through `natlang:services` like any other capability. Values come back inlined. Node only.
 */
import type { CallStore, CallSummary, HotDefinition } from './store.js';
import type { CaseRole, CaseStats } from './types.js';
export type TraceCall = {
    call: string;
    definition: string;
    executor: string;
    outcome: string;
    started: string;
    ms: number;
    inputs: Record<string, unknown>;
    result: unknown;
    effects: {
        call: string;
        args: unknown;
        result?: unknown;
        error?: string;
    }[];
    evals: string[];
    case?: string;
};
/** The service object. Every method is synchronous and returns plain data. */
export declare function tracesService(store: CallStore): {
    hot: (options?: {
        program?: string;
        since?: string;
        by?: "calls" | "tokens" | "wall_ms";
        limit?: number;
    }) => HotDefinition[];
    calls: (filter?: {
        definition?: string;
        outcome?: string;
        executor?: string;
        since?: string;
        limit?: number;
        after?: string;
    }) => CallSummary[];
    call: (id: string) => TraceCall | null;
    children: (id: string) => CallSummary[];
    annotate: (id: string, kind: string, value: unknown) => void;
    compilation: (definition: string) => {
        id: string;
        cases: CaseStats[];
        source: string;
    } | null;
    caseCalls: (hash: string, role?: CaseRole, limit?: number) => {
        call_id: string;
        role: CaseRole;
        verdict: import("./types.js").Verdict | null;
        created_at: string;
    }[];
};
/** What the model is shown of the service (`serviceDeclarations.traces`). */
export declare const TRACES_DECLARATIONS = "/** A recorded call, with its values. */\nexport type TraceCall = { call: string; definition: string; executor: 'agent' | 'crisp' | 'crisp-agent'; outcome: string; started: string; ms: number;\n  inputs: Record<string, unknown>; result: unknown; effects: { call: string; args: unknown; result?: unknown; error?: string }[];\n  /** The eval programs the executor ran, in order. */ evals: string[]; case?: string };\nexport type CallSummary = { call_id: string; definition_name: string; executor: string; outcome: string; started_at: string; wall_ms: number;\n  approach_hash: string | null };\n/** Functions by how often (or how expensively) they ran. */\nexport function hot(options?: { program?: string; since?: string; by?: 'calls' | 'tokens' | 'wall_ms'; limit?: number }): { definition_name: string;\n  definition_source: string | null; definition_key: string; calls: number; agent_calls: number; crisp_calls: number; tokens: number }[];\n/** Recorded calls, newest first. definition is a function name, source path or revision key. */\nexport function calls(filter?: { definition?: string; outcome?: string; executor?: string; since?: string; limit?: number; after?: string }): CallSummary[];\n/** One recorded call with its inputs, result, service calls and eval programs; null when it is not in the store. */\nexport function call(id: string): TraceCall | null;\n/** The calls a call started. */\nexport function children(id: string): CallSummary[];\n/** Attach feedback or a judgment to a call. */\nexport function annotate(id: string, kind: string, value: unknown): void;\n/** The current compilation of a function: its cases with their numbers and its cases.ts source. */\nexport function compilation(definition: string): { id: string; cases: unknown[]; source: string } | null;\n/** The calls linked to a case, by role (training, held-out, served, handed-off, shadow, audit). */\nexport function caseCalls(hash: string, role?: string, limit?: number): { call_id: string; role: string; verdict: string | null }[];\n";
