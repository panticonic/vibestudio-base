import type { ShareAssignment as Assignment, ShareObservation as Observation, ShareDecision as Decision, ShareReceipt as Receipt } from "./contract.js";
export type ShareAssignment = Assignment;
export type ShareObservation = Observation;
export type ShareDecision = Decision;
export type ShareReceipt = Receipt;
export type ShareFinding = { decision: Decision; reason: string };
export type WorkspaceShareOutcome = { assignment: Assignment; observation: Observation; finding: ShareFinding; handoff: Receipt | null };
