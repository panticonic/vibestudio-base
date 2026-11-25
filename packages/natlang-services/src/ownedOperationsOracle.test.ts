import { describe, it, expect } from "vitest";
import { verifyOwnedOperations, verifyOwnedOperationCustody } from "./ownedOperationsOracle.js";
import type { Audit } from "./ownedOperations.js";
// Pure oracle unit fixtures; none are product execution or teacher-collection evidence.
function auditFixture(): Audit {
  const handle = { id: "issued-worker", contextId: "issued-context", targetId: "actual-rpc-target", role: "release" as const };
  const first: Audit["snapshots"][number]["value"] = { revision: 1, checkpoints: [{ revision: 1, assessment: { role: "release" as const,
    evidenceIds: ["security", "quality"], decision: "blocked" as const, reason: "Quality check pending" } }] };
  const last = structuredClone(first);
  last.revision = 2;
  last.checkpoints.push({ revision: 2, assessment: { role: "release", evidenceIds: ["security", "quality"], decision: "ready", reason: "Checks approved" } });
  return { programRequestedCleanup: true, opened: [{ handle, original: { id: handle.id } }],
    snapshots: [{ handle, phase: "before-restart", value: first }, { handle, phase: "after-restart", value: structuredClone(first) },
      { handle, phase: "before-cleanup", value: last }],
    restarts: [{ handle, before: [{ entityId: handle.id }], after: [{ entityId: handle.id }] }],
    retiredIds: [handle.id], destroyedContextIds: [handle.contextId], remainingEntityIds: [], remainingContextIds: [] };
}
const expected = { kind: "release-continuation" as const, roles: { release: { decisions: ["blocked", "ready"], evidenceIds: ["security", "quality"] } }, decision: "ready" };
function reportFixture(audit: Audit) { return { kind: "release-continuation", handoff: { decision: "ready", evidenceIds: ["security", "quality"] }, handles: audit.opened.map(row => row.handle), cleanup: { retiredIds: audit.retiredIds, destroyedContextIds: audit.destroyedContextIds } }; }
describe("independent owned lifecycle oracle", () => {
  it("requires both persisted checkpoints, actual restart continuity and exact cleanup", () => {
    expect(verifyOwnedOperations(auditFixture(), expected, reportFixture(auditFixture())).passed).toBe(true);
  });
  it.each(["missing-readback", "changed-checkpoint", "wrong-evidence", "live-resource", "lost-context", "no-restart", "host-only-cleanup", "reported-foreign-handle", "reported-false-cleanup"])("rejects %s despite a ready report", mutation => {
    const audit = auditFixture();
    const report = reportFixture(structuredClone(audit));
    if (mutation === "host-only-cleanup") audit.programRequestedCleanup = false;
    if (mutation === "reported-foreign-handle") report.handles[0]!.targetId = "foreign";
    if (mutation === "reported-false-cleanup") report.cleanup.retiredIds = [];
    if (mutation === "missing-readback") audit.snapshots.pop();
    if (mutation === "changed-checkpoint") audit.snapshots[1]!.value.revision = 0;
    if (mutation === "wrong-evidence") audit.snapshots[2]!.value.checkpoints[1]!.assessment.evidenceIds = ["invented"];
    if (mutation === "live-resource") audit.remainingEntityIds = [audit.opened[0]!.handle.id];
    if (mutation === "lost-context") audit.destroyedContextIds = [];
    if (mutation === "no-restart") audit.restarts = [];
    expect(verifyOwnedOperations(audit, expected, report).passed).toBe(false);
  });
});

describe("native custody independent of semantic answer expectations",()=>{
 it("accepts actual differently worded/selected assessments without inventing requested findings",()=>{
  const audit=auditFixture();audit.snapshots[2]!.value.checkpoints[1]!.assessment={role:"release",decision:"blocked",reason:"A differently judged actual conclusion",evidenceIds:["quality"]};
  expect(verifyOwnedOperationCustody(audit).passed).toBe(true);
  expect(verifyOwnedOperations(audit,expected,reportFixture(audit)).passed).toBe(false);
 });
 it("does not require a worker, checkpoint or restart when none was actually created",()=>{
  const audit:Audit={programRequestedCleanup:false,opened:[],snapshots:[],restarts:[],retiredIds:[],destroyedContextIds:[],remainingEntityIds:[],remainingContextIds:[]};
  expect(verifyOwnedOperationCustody(audit).passed).toBe(true);
 });
 it.each(["missing-readback","foreign-handle","wrong-role","changed-restart","live-worker","missing-context"])("rejects native custody corruption: %s",mutation=>{
  const audit=auditFixture();
  if(mutation==="missing-readback")audit.snapshots.pop();
  if(mutation==="foreign-handle")audit.snapshots[0]!.handle={...audit.snapshots[0]!.handle,targetId:"foreign"};
  if(mutation==="wrong-role")audit.snapshots[2]!.value.checkpoints[0]!.assessment.role="impact";
  if(mutation==="changed-restart")audit.snapshots[1]!.value.revision=0;
  if(mutation==="live-worker")audit.remainingEntityIds=[audit.opened[0]!.handle.id];
  if(mutation==="missing-context")audit.destroyedContextIds=[];
  expect(verifyOwnedOperationCustody(audit).passed).toBe(false);
 });
});
