import type { EvalHandoffGoalReport as EvalReport } from "./workOnEvalHandoffGoal/journal/types.js";
import type { ProgramRunReport as RuntimeReport } from "./workOnProgramRunGoal/runtime/types.js";
import type { AuthoringOpenOutcome as OpenOutcome, AuthoringReceipt as ReviewReceipt } from "./workOnAuthoringGoal/discovery/types.js";

export type AuthoringOpenOutcome = OpenOutcome;
export type AuthoringReceipt = ReviewReceipt;
export type ProgramRunReport = RuntimeReport;
export type EvalHandoffGoalReport = EvalReport;
