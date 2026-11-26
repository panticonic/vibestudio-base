import type { ActionAssignment as Assignment, ActionEvidence as Evidence, CapabilityDecision as Decision,
  Continuation as Result, RetainedNotebookValue as RetainedValue } from "./contract.js";
export type ActionAssignment = Assignment;
export type ActionEvidence = Evidence;
export type CapabilityDecision = Decision;
export type Continuation = Result;
export type RetainedNotebookValue = RetainedValue;
export type AttemptPair = { current: Evidence; prior: Evidence|null };
export type ContinuationFinding = { decision: Decision; reason: string };
export type AgentRecoveryFindings = {
  explanation:string;
  continuation: Result | null;
  /** Include requested retained content only after an actual scoped value read. */
  retainedValues?: RetainedValue[];
};

export type CapabilityRecoveryInquiry={assignment:Assignment;evidence:AttemptPair|null;finding:ContinuationFinding|null};
