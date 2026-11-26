import type { PanelMigrationAssignment as Assignment, MigrationObservation as Observation,
  MigrationDecision as Decision, MigrationReceipt as Receipt } from "./contract.js";
export type PanelMigrationAssignment = Assignment;
export type MigrationObservation = Observation;
export type MigrationDecision = Decision;
export type MigrationReceipt = Receipt;
export type MigrationFinding = { decision: Decision; reason: string };
export type PanelSourceMigrationOutcome = { finding: string; move: Receipt | null; identity: Receipt | null; consumers: Receipt | null };
