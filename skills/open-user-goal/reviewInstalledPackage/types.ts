import type { SuiteReviewReport as Verification } from "./reviewVerification/nativeSuite/types.js";
import type { PackageAssignment as Assignment, PackageObservation as Observation, PackageDecision as Decision,
  PackageRestore as Restore } from "./contract.js";

export type PackageAssignment = Assignment;
export type PackageObservation = Observation;
export type PackageRestore = Restore;
export type PackageDecision = Decision;
export type PackageFinding = { decision: Decision; reason: string };
export type InstalledPackageOutcome = string;
export type InstalledPackageInvestigation = { assignment: Assignment; observation: Observation; finding: PackageFinding };
export type SuiteReviewReport = Verification;
