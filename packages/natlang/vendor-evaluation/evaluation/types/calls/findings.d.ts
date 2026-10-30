/**
 * Findings (§5.3): what mining a function's recorded calls shows about the program or its executor, reported to the
 * program's owner instead of only shaping a decline. Crisp detectors over a study; the writer's `unstable` skips and the
 * judge's `better` verdicts for cases add to them (applications/specializer).
 */
import type { Study } from './specializer.js';
import type { CallStore, FindingInput } from './store.js';
/** Findings in a study: identical inputs handled differently, and service arguments whose type varies between calls. */
export declare function detectFindings(store: CallStore, subject: Study): FindingInput[];
/** A case the judge found better than the executor on some calls: the executor got those calls wrong. */
export declare function betterFinding(subject: Study, caseLabel: string, calls: readonly string[]): FindingInput | undefined;
