import type { ActionAssignment as Assignment, ActionEvidence as Evidence, CapabilityDecision as Decision,
  Continuation as Result } from "./contract.js";
export type ActionAssignment = Assignment;
export type ActionEvidence = Evidence;
export type CapabilityDecision = Decision;
export type Continuation = Result;
export type AttemptPair = { current: Evidence; prior: Evidence };
export type ContinuationFinding = { decision: Decision; reason: string };
export type AgentCapabilityOutcome = { finding: ContinuationFinding; continuation: Result | null };
