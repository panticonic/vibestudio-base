import type { EvalRecoveryResult as EvalReport } from "../workOnEvalHandoffGoal/journal/types.js";
import type {
  RecoveryHandoffDirective as Directive, RecoveryHandoffInput as Input, RecoveryScratchStatus as ScratchStatus,
} from "./contract.js";

export type EvalRecoveryResult = EvalReport;
export type RecoveryHandoffDirective = Directive;
export type RecoveryHandoffInput = Input;
export type RecoveryHandoffOutcome = {
  status: ScratchStatus | "held-eval" | "held-policy";
  handoff: {
    status: ScratchStatus;
    artifact: { path: string; bytes: number } | null;
    missingSources: string[];
    unanswered: string[];
  } | null;
  reason: string;
};
