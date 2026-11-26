import { nativeWireEqual } from "./nativeWireEqual.js";
import type { Audit } from "./ownedOperations.js";
export type Expected = { kind: "incident-handoff" | "release-continuation";
  roles: Record<string, { decision?: string; decisions?: string[]; evidenceIds: string[] }>; decision: string };
/** Test-owned exact oracle. Its private audit comes from fresh persisted-state/lifecycle readbacks, never the model's report. */
export function verifyOwnedOperations(audit: Audit, expected: Expected, report: { kind: string; handoff: { decision: string; evidenceIds: string[] }; handles: Audit["opened"][number]["handle"][]; cleanup: { retiredIds: string[]; destroyedContextIds: string[] } }) {
  const checks: Record<string, boolean> = {...verifyOwnedOperationCustody(audit).checks};
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
      nativeWireEqual(before[0]?.value, after[0]?.value);
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

/** Independent native custody, without private semantic decisions or a required report echo. */
export function verifyOwnedOperationCustody(audit: Audit, {matchRestartsByOwner=true}: {matchRestartsByOwner?:boolean}={}) {
  const handles=audit.opened.map(row=>row.handle);
  const issued=(handle:Audit["opened"][number]["handle"])=>handles.some(actual=>nativeWireEqual(actual,handle));
  const sameSet=(actual:string[],expected:string[])=>actual.length===expected.length &&
    new Set(actual).size===actual.length && expected.every(id=>actual.includes(id));
  const before=audit.snapshots.filter(row=>row.phase==="before-restart");
  const after=audit.snapshots.filter(row=>row.phase==="after-restart");
  const checks={
    nativeIssuedOwners:audit.opened.every(({handle,original})=>{
      if(original===null||typeof original!=="object"||Array.isArray(original))return false;
      return [["id",handle.id],["kind","do"],["contextId",handle.contextId],["targetId",handle.targetId]].every(([key,value])=>{
        const descriptor=Object.getOwnPropertyDescriptor(original,key!);
        return !!descriptor&&Object.hasOwn(descriptor,"value")&&descriptor.value===value;
      });
    }),
    nativeDistinctOwners:new Set(handles.map(row=>row.id)).size===handles.length &&
      new Set(handles.map(row=>row.contextId)).size===handles.length,
    nativeOwnedReadbacks:audit.snapshots.every(row=>issued(row.handle) &&
      row.value.revision===row.value.checkpoints.length && row.value.checkpoints.every((checkpoint,index)=>
        checkpoint.revision===index+1 && checkpoint.assessment.role===row.handle.role)) &&
      handles.every(handle=>{
        const rows=audit.snapshots.filter(row=>nativeWireEqual(row.handle,handle));
        const final=rows.findLast(row=>row.phase==="before-cleanup");
        return !!final && rows.every(row=>row.value.revision<=final.value.revision &&
          nativeWireEqual(row.value.checkpoints,final.value.checkpoints.slice(0,row.value.revision)));
      }),
    nativeRestartContinuity:before.length===audit.restarts.length && after.length===audit.restarts.length &&
      audit.restarts.every((restart,index)=>issued(restart.handle) &&
        Array.isArray(restart.before)&&restart.before.length>0&&Array.isArray(restart.after)&&restart.after.length>0 &&
        (matchRestartsByOwner || (nativeWireEqual(before[index]?.handle,restart.handle) &&
          nativeWireEqual(after[index]?.handle,restart.handle) && nativeWireEqual(before[index]?.value,after[index]?.value)))) &&
      (!matchRestartsByOwner || handles.every(handle=>{
        const count=audit.restarts.filter(row=>nativeWireEqual(row.handle,handle)).length;
        const prior=before.filter(row=>nativeWireEqual(row.handle,handle)).map(row=>row.value).sort((a,b)=>b.revision-a.revision);
        const current=after.filter(row=>nativeWireEqual(row.handle,handle)).map(row=>row.value).sort((a,b)=>b.revision-a.revision);
        return prior.length===count&&current.length===count&&prior.every((value,index)=>{
          const observed=current[index];
          return !!observed&&observed.revision>=value.revision&&nativeWireEqual(value.checkpoints,observed.checkpoints.slice(0,value.revision));
        });
      })),
    nativeRetiredWorkers:sameSet(audit.retiredIds,handles.map(row=>row.id)) && audit.remainingEntityIds.length===0,
    nativeDestroyedContexts:sameSet(audit.destroyedContextIds,handles.map(row=>row.contextId)) && audit.remainingContextIds.length===0,
  };
  return {checks,passed:Object.values(checks).every(Boolean)};
}
