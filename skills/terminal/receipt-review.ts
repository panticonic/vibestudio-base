import type { TerminalOperationEvidence } from "../device-and-terminal-review/types.js";
import type { TerminalCheckResult, TerminalPlan } from "./natlang/types.js";

type RetainedResult = { contextId: string; operationId: string; result: TerminalCheckResult };

export function bindTerminalReceiptReview(input: {
  goal: string;
  assigned: RetainedResult & { plan: TerminalPlan };
  retained: RetainedResult;
}) {
  const { goal, assigned, retained } = input;
  const { operationId, contextId } = assigned;
  const check = assigned.plan.checks.find(({ id }) => id === assigned.result.id);
  if (!check || assigned.plan.receipt !== `${operationId}:plan`)
    throw new Error("The invocation plan does not identify the assigned operation");
  for (const { result, operationId } of [assigned, retained]) {
    if (result.receipt !== `${operationId}:check:${result.id}`)
      throw new Error("The retained result does not identify its originating operation");
  }
  const mode = check.mode === "script" ? "shell" : "argv";
  const result = retained.result;
  const evidence: TerminalOperationEvidence = {
    kind: "terminal",
    goal,
    target: {
      id: operationId, contextId, operationId,
      purpose: mode === "shell" ? "shell-composition" : "ordinary-process",
    },
    invocation: assigned.result.status === "complete"
      ? { id: assigned.plan.receipt, contextId, operationId, mode, admission: "admitted" }
      : null,
    result: result.status === "complete" ? {
      id: result.receipt,
      contextId: retained.contextId,
      operationId: retained.operationId,
      exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated,
      hasStdout: !!result.stdout, hasStderr: !!result.stderr,
    } : null,
  };
  let used = false;
  return {
    request: { kind: "terminal-receipt" as const, goal, operationId },
    services: {
      terminalEvidenceRead: {
        async inspect(id: string) {
          if (id !== operationId || used) throw new Error("Inspect the assigned terminal receipt once");
          used = true;
          return structuredClone(evidence);
        },
      },
    },
  };
}
