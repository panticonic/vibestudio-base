import type { EvalHandoffGoalReport as EvalReport } from "../workOnEvalHandoffGoal/journal/types.js";
import type {
  RecoveryHandoffDirective as Directive, RecoveryHandoffInput as Input, RecoveryScratchStatus as ScratchStatus,
} from "./contract.js";

export type EvalHandoffGoalReport = EvalReport;
export type RecoveryHandoffDirective = Directive;
export type RecoveryHandoffInput = Input;
export type RecoveryHandoffOutcome = {
  status: ScratchStatus | "held-eval" | "held-policy";
  recovery: EvalReport;
  directive: Directive;
  handoff: {
    status: ScratchStatus;
    artifact: { path: string; bytes: number } | null;
    missingSources: string[];
    unanswered: string[];
  } | null;
  reason: string;
};
