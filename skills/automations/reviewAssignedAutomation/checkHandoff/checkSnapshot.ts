import type {
  AssignedAutomation,
  AutomationPlanningSnapshot,
  AutomationReport,
} from "../../types.js";

function index(snapshot: AutomationPlanningSnapshot) {
  return new Map(snapshot.visible.map((record) => [record.id, record]));
}

function sameRecord(
  left: AssignedAutomation,
  right: AssignedAutomation,
): boolean {
  if (
    left.name !== right.name ||
    left.revisionDigest !== right.revisionDigest ||
    left.state !== right.state
  )
    return false;
  const first = left.latestRun;
  const second = right.latestRun;
  if (!first || !second) return first === second;
  return (
    first.id === second.id &&
    first.phase === second.phase &&
    first.outcome === second.outcome &&
    first.errors.length === second.errors.length &&
    first.errors.every(
      (error, i) =>
        error.operation === second.errors[i]!.operation &&
        error.description === second.errors[i]!.description,
    )
  );
}

export default function checkSnapshot(
  plan: AutomationReport,
  before: AutomationPlanningSnapshot,
  after: AutomationPlanningSnapshot,
): "matching" | "different" | "unsupported" {
  if (plan.kind !== "control" && plan.kind !== "inspect") return "unsupported";
  const original = index(before);
  const current = index(after);
  const target = original.get(plan.automationId);
  if (!target || original.size !== before.visible.length) return "unsupported";
  const errors = target.latestRun?.errors ?? [];
  if (
    plan.kind === "inspect" &&
    (plan.failedOperations.length !== errors.length ||
      !errors.every(
        (error, index) => plan.failedOperations[index] === error.operation,
      ) ||
      plan.runId !== (target.latestRun?.id ?? null) ||
      plan.state !== target.state ||
      plan.outcome !== (target.latestRun?.outcome ?? null))
  )
    return "unsupported";

  if (current.size !== after.visible.length || current.size !== original.size)
    return "different";
  for (const [id, previous] of original) {
    const latest = current.get(id);
    if (!latest || !sameRecord(previous, latest)) return "different";
  }
  return "matching";
}
