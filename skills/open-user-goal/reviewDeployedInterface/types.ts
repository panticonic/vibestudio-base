import type { ArchitectureReport as Architecture } from "./architecture/types.js";
import type {
  InterfaceSurvey as Survey, InterfaceObservation as Observation, InterfaceDecision as Decision, InterfaceHandoff as Handoff,
} from "./contract.js";

export type InterfaceSurvey = Survey;
export type InterfaceObservation = Observation;
export type ArchitectureReport = Architecture;
export type InterfaceDecision = Decision;
export type InterfaceHandoff = Handoff;
export type InterfaceFinding = { decision: Decision; reason: string };
export type DeployedInterfaceOutcome = { finding: InterfaceFinding; handoff: Handoff | null };
