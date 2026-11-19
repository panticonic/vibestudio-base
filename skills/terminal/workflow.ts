import { contextId, extensions } from "@workspace/runtime";
import type {
  TerminalCheck,
  TerminalCheckRequest,
  TerminalCheckResult,
  TerminalPlan,
} from "./natlang/types.js";

type Intent =
  | { kind: "argv"; executable: string; args: string[] }
  | { kind: "script"; script: string };
type AssignedCheck = Omit<TerminalCheck, "mode"> & {
  intent: Intent;
  timeoutMs: number;
  maxOutputBytes: number;
};

function boundedInteger(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Execute only what the caller sealed, inside the current materialized context. */
export function bindTerminalChecks(assignment: {
  goal: string;
  checks: AssignedCheck[];
}) {
  const assignedContext = contextId;
  if (!assignedContext)
    throw new Error("Terminal checks require an assigned workspace context");
  const checks = structuredClone(assignment.checks);
  const byId = new Map<string, AssignedCheck>();
  if (checks.length < 1 || checks.length > 8)
    throw new Error("Assign between one and eight bounded terminal checks");
  for (const check of checks) {
    if (
      byId.has(check.id) ||
      !check.id ||
      !check.prerequisites.every((id) => byId.has(id)) ||
      !boundedInteger(check.timeoutMs, 1, 60_000) ||
      !boundedInteger(check.maxOutputBytes, 1024, 8192)
    )
      throw new Error(
        "Terminal checks need unique IDs, earlier prerequisites, and bounded process limits",
      );
    byId.set(check.id, check);
  }
  const operationId = crypto.randomUUID();
  const receipt = `${operationId}:plan`;
  const request: TerminalCheckRequest = { goal: assignment.goal, operationId };
  let observed = false;
  let running = false;
  const attempted = new Set<string>();
  const passed = new Set<string>();

  return {
    request,
    services: {
      terminalCheckRead: {
        async observe(id: string): Promise<TerminalPlan> {
          if (id !== operationId || observed)
            throw new Error("Read the assigned terminal plan once");
          observed = true;
          return {
            receipt,
            checks: checks.map(({ id, purpose, intent, prerequisites }) => ({
              id,
              purpose,
              mode: intent.kind,
              prerequisites: [...prerequisites],
            })),
          };
        },
      },
      terminalCheckRun: {
        async execute(
          assignmentReceipt: string,
          checkId: string,
        ): Promise<TerminalCheckResult> {
          const check = byId.get(checkId);
          if (
            !observed ||
            assignmentReceipt !== receipt ||
            !check ||
            attempted.has(checkId) ||
            running ||
            !check.prerequisites.every((id) => passed.has(id))
          )
            throw new Error(
              "Run only an unattempted assigned check with completed prerequisites",
            );

          attempted.add(checkId);
          running = true;
          const result: TerminalCheckResult = {
            receipt: `${operationId}:check:${checkId}`,
            id: checkId,
            status: "unavailable",
            exitCode: null,
            timedOut: false,
            truncated: false,
            stdout: "",
            stderr: "",
          };
          try {
            const reply: unknown = await extensions.invoke("shell", "exec", [
              {
                intent: check.intent,
                contextId: assignedContext,
                timeoutMs: check.timeoutMs,
                maxOutputBytes: check.maxOutputBytes,
              },
            ]);
            if (
              !reply ||
              typeof reply !== "object" ||
              !("exitCode" in reply) ||
              !(reply.exitCode === null || Number.isInteger(reply.exitCode)) ||
              !("stdout" in reply) ||
              typeof reply.stdout !== "string" ||
              !("stderr" in reply) ||
              typeof reply.stderr !== "string"
            )
              return result;
            const exitCode = reply.exitCode as number | null;
            const timedOut = "timedOut" in reply && reply.timedOut === true;
            const truncated = "truncated" in reply && reply.truncated === true;
            if (exitCode === 0 && !timedOut && !truncated) passed.add(checkId);
            return {
              ...result,
              status: "complete",
              exitCode,
              timedOut,
              truncated,
              stdout: reply.stdout,
              stderr: reply.stderr,
            };
          } catch {
            return result;
          } finally {
            running = false;
          }
        },
      },
    },
  };
}
