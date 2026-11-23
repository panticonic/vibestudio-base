import type {
  BuildIncidentBlocker as Blocker, BuildIncidentFinding as Finding,
  IncidentFocus as Focus, IncidentReceipt as Receipt, IncidentSurvey as Survey, RetainedProfile as Profile,
} from "./contract.js";
import type { BuildPerformanceReport as Review } from "./performance/types.js";

export type IncidentSurvey = Survey;
export type RetainedProfile = Profile;
export type IncidentFocus = Focus;
export type BuildPerformanceReport = Review;
export type IncidentReceipt = Receipt;
export type IncidentSelection = { focus: Focus; current: Profile | null; baseline: Profile | null };
export type IncidentAssessment = { checkpoint: Profile["checkpoint"]; trace: Profile["trace"]; diagnostic: Profile["diagnostic"]; review: Review };
export type IncidentDisposition = { finding: Finding; blocker: Blocker | null; reason: string };
export type BuildIncidentOutcome = { current: IncidentAssessment | null; baseline: IncidentAssessment | null; disposition: IncidentDisposition; handoff: Receipt | null };
