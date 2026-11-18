import type { Audit } from "./ownedOperations.js";
export type Expected = { kind: "incident-handoff" | "release-continuation";
  roles: Record<string, { decision?: string; decisions?: string[]; evidenceIds: string[] }>; decision: string };
/** Test-owned exact oracle. Its private audit comes from fresh persisted-state/lifecycle readbacks, never the model's report. */
export function verifyOwnedOperations(audit: Audit, expected: Expected, report: { kind: string; handoff: { decision: string; evidenceIds: string[] }; handles: Audit["opened"][number]["handle"][]; cleanup: { retiredIds: string[]; destroyedContextIds: string[] } }) {
  const checks: Record<string, boolean> = {};
  const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  const handles = audit.opened.map(row => row.handle);
  checks["exactRoles"] = sameSet(handles.map(row => row.role), Object.keys(expected.roles));
  checks["distinctOwnedWorkers"] = new Set(handles.map(row => row.id)).size === handles.length;
  checks["distinctOwnedContexts"] = new Set(handles.map(row => row.contextId)).size === handles.length;
  for (const handle of handles) {
    const wanted = expected.roles[handle.role];
    const readbacks = audit.snapshots.filter(row => row.handle.id === handle.id && row.phase === "before-cleanup");
    checks[`${handle.role}.independentReadback`] = readbacks.length === 1;
    const state = readbacks[0]?.value;
    const decisions = wanted?.decisions ?? [wanted?.decision];
    checks[`${handle.role}.retainedRevision`] = state?.revision === decisions.length && state.checkpoints.length === decisions.length;
    checks[`${handle.role}.persistedDecisions`] = !!state && state.checkpoints.every((row, i) =>
      row.revision === i + 1 && row.assessment.role === handle.role && row.assessment.decision === decisions[i]);
    checks[`${handle.role}.persistedEvidence`] = !!wanted && !!state && state.checkpoints.every(row => sameSet(row.assessment.evidenceIds, wanted.evidenceIds));
  }
  if (expected.kind === "release-continuation") {
    const before = audit.snapshots.filter(row => row.phase === "before-restart");
    const after = audit.snapshots.filter(row => row.phase === "after-restart");
    checks["realRestart"] = audit.restarts.length === 1 && audit.restarts[0]?.handle.id === handles.find(row => row.role === "release")?.id && Array.isArray(audit.restarts[0]?.before) &&
      audit.restarts[0].before.length > 0 && Array.isArray(audit.restarts[0]?.after) && audit.restarts[0].after.length > 0;
    checks["sameWorkerContinuity"] = before.length === 1 && after.length === 1 && before[0]?.handle.id === after[0]?.handle.id &&
      JSON.stringify(before[0]?.value) === JSON.stringify(after[0]?.value);
  } else checks["noUnrequestedRestart"] = audit.restarts.length === 0;
  checks["programRequestedCleanup"] = audit.programRequestedCleanup;
  checks["reportedWorkflowKind"] = report.kind === expected.kind;
  checks["reportedHandles"] = report.handles.length === handles.length && handles.every(handle =>
    report.handles.some(value => Object.keys(handle).every(key => value[key as keyof typeof value] === handle[key as keyof typeof handle])));
  checks["reportedCleanup"] = sameSet(report.cleanup.retiredIds, audit.retiredIds) && sameSet(report.cleanup.destroyedContextIds, audit.destroyedContextIds);
  checks["reportedEvidence"] = sameSet(report.handoff.evidenceIds, [...new Set(Object.values(expected.roles).flatMap(role => role.evidenceIds))]);
  checks["reportMatchesPersistedDecision"] = report.handoff.decision === expected.decision;
  checks["exactRetiredWorkers"] = sameSet(audit.retiredIds, handles.map(row => row.id));
  checks["exactDestroyedContexts"] = sameSet(audit.destroyedContextIds, handles.map(row => row.contextId));
  checks["actualNoOwnedWorkersRemain"] = audit.remainingEntityIds.length === 0;
  checks["actualNoOwnedContextsRemain"] = audit.remainingContextIds.length === 0;
  return { passed: Object.values(checks).every(Boolean), checks };
}
