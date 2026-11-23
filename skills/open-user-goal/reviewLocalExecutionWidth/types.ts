import type { Readiness as NativeReadiness } from "./readiness/types.js";
import type {
  WidthSurvey as Survey, WidthReceipt as Witness, WidthFinding as Finding, WidthHandoff as Handoff,
} from "./contract.js";
export type Readiness = NativeReadiness;
export type WidthSurvey = Survey;
export type WidthReceipt = Witness;
export type WidthFinding = Finding;
export type WidthHandoff = Handoff;
export type LocalWidthOutcome = { finding: Finding; handoff: Handoff | null };
