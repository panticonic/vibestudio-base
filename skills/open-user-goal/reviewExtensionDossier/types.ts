import type { ExtensionReleaseReview as Review } from "./extensiondev/types.js";
import type { DossierDecision as Decision, DossierReceipt as Receipt, ReleaseHistory as History, ManifestDelta as Delta, DossierAssignment as Assignment } from "./contract.js";

export type DossierAssignment = Assignment;
export type DossierDecision = Decision;
export type DossierReceipt = Receipt;
export type ExtensionReleaseReview = Review;
export type ManifestDelta = Delta;
export type ReleaseHistory = History;
export type DossierFinding = { decision: Decision; reason: string };
export type CandidateComparison = { delta: Delta; compatibility: "invalid" | "authority-review" | "verification-needed" | "published-package" };
export type ExtensionDossierOutcome = { finding: DossierFinding; dossier: Receipt | null };
