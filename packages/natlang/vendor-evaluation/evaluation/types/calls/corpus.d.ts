import type { CallStore } from './store.js';
export type CorpusSummary = {
    cases: number;
    declines: number;
    findings: number;
    calls: number;
    files: string[];
};
/** Write the corpus files under `out`. `perCase` bounds the calls kept per case, `perDecline` per decline. */
export declare function exportSpecializationCorpus(store: CallStore, out: string, options?: {
    definition?: string;
    perCase?: number;
    perDecline?: number;
}): CorpusSummary;
