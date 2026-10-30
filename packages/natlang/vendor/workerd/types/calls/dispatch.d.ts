/**
 * Guard dispatch and the hand-off to the agent (§6.4, §6.5). The kernel asks which case admits a call, runs it, and
 * when it throws gives the agent one note saying what the case already did.
 */
import type { LoadedCase, LoadedCompilation } from './compilations.js';
import type { EffectRecord } from './types.js';
/** A case declines an input its guard admitted; the call goes to the agent as if no case had admitted it. */
export declare class Deopt extends Error {
    constructor(reason?: string);
}
export declare const isDeopt: (error: unknown) => boolean;
/**
 * The first active case whose guard admits `args` (in `on` mode), and every shadow case whose guard admits them. A case
 * that uses a service the task does not provide (`provided`) is not considered: it could only fail and hand off.
 */
export declare function admit(compilation: LoadedCompilation, args: Record<string, unknown>, mode: 'on' | 'shadow', provided?: (service: string) => boolean): {
    active?: LoadedCase;
    shadows: LoadedCase[];
    guardErrors: {
        hash: string;
        error: string;
    }[];
};
/**
 * The note the agent's opening carries after a case stopped: the error, the effects that already happened, the files
 * the case changed and the calls it finished. Shown only on a hand-off; one paragraph, no new names.
 */
export declare function handoffNote(input: {
    error: string;
    effects: {
        effect: EffectRecord;
        args?: unknown;
        result?: unknown;
    }[];
    files: {
        path: string;
        kind: string;
    }[];
    calls: {
        name: string;
        outcome: string;
    }[];
}): string;
