import type { CaseEvidence, ReleaseAssessment, ReleaseAssignment, RetainedRunPair, RunChoice } from "./contract.js";
export type { CaseEvidence, ReleaseAssessment, ReleaseAssignment, ReleaseReceipt, RetainedRunPair, RunChoice, SystemReleaseOutcome } from "./contract.js";
export type ComparedRelease = { runs: RetainedRunPair; choice: RunChoice };
export type EvaluatedReleaseCases = { cases: CaseEvidence[]; assessment: ReleaseAssessment };

export type SystemReleaseInvestigation = { assignment: ReleaseAssignment; compared: ComparedRelease; evaluated: EvaluatedReleaseCases | null };
