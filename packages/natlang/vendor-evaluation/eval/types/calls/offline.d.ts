import { type CallableDefinition } from '../runtime/kernel.js';
import type { NatlangRuntime } from '../runtime/runtime.js';
import type { Platform } from '../runtime/platform.js';
import { type LoadedCase } from './compilations.js';
import { type Behavior } from './judge.js';
import type { AuditJob, CallStore } from './store.js';
import { type CallRecord, type Verdict } from './types.js';
/** The definition a record ran: loaded from its program when the source still matches, else rebuilt from the record. */
export declare function definitionFor(store: CallStore, record: CallRecord): {
    definition: CallableDefinition;
    loaded: boolean;
};
export declare const signatureOf: (definition: {
    name: string;
    params: {
        name: string;
        type: string;
        optional?: boolean;
    }[];
    returns: string;
}) => string;
/** Find a case by hash in the current compilation of a definition revision, loaded in `definition`'s context. */
export declare function caseFor(platform: Platform, store: CallStore, definitionKeyValue: string, hash: string, definition: CallableDefinition): LoadedCase | undefined;
/** Run a case on a recorded call's inputs against its recorded effects; its behavior, or why it could not run. */
export declare function replayCaseOn(runtime: NatlangRuntime, store: CallStore, item: Pick<LoadedCase, 'run'>, record: CallRecord): Promise<Behavior | {
    skipped: string;
}>;
/** Run the agent on a recorded call's inputs, answering services from `effects` (an audit, §6.3). */
export declare function rerunAgent(runtime: NatlangRuntime, store: CallStore, definition: CallableDefinition, record: CallRecord): Promise<Behavior | {
    skipped: string;
}>;
/** Judge a case's behavior against the agent's on one call. */
export declare function verdictFor(runtime: NatlangRuntime, store: CallStore, definition: CallableDefinition, record: CallRecord, agent: Behavior, crisp: Behavior): Promise<{
    verdict: Verdict;
    differences: string[];
}>;
/** Process one shadow or audit job and record its verdict. */
export declare function runJob(runtime: NatlangRuntime, store: CallStore, job: AuditJob): Promise<{
    status: 'done' | 'skipped' | 'failed';
    verdict?: Verdict;
    detail?: string;
}>;
/** Process pending jobs, oldest first. Returns how many ran. */
export declare function runJobs(runtime: NatlangRuntime, store: CallStore, options?: {
    limit?: number;
    signal?: AbortSignal;
    log?: (line: string) => void;
}): Promise<number>;
