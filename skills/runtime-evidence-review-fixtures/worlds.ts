import type {
  EvalNext,
  ProgramNext,
  RuntimeEvalInput,
  RuntimeEvidenceReport,
  RuntimeEvidenceRequest,
  RuntimeProgramInput,
  RuntimeTraceInput,
  TraceNext,
} from "../runtime-evidence-review/types.js";

function task(
  id: string,
  family: string,
  request: RuntimeEvidenceRequest,
  expected: RuntimeEvidenceReport,
) {
  return {
    id: `runtime-evidence-${id}`,
    sourceGroup: `vibestudio:runtime-evidence:${family}`,
    request,
    expected,
  };
}
function program(
  id: string,
  goal: string,
  patch: Partial<RuntimeProgramInput>,
  next: ProgramNext,
  basis?: string,
) {
  const request: RuntimeProgramInput = {
    kind: "program",
    goal,
    path: "skills/review/main.nl",
    compiler: "passed",
    diagnostic: null,
    call: null,
    userRequestedRetry: false,
    ...patch,
  };
  return task(id, "natlang-authoring", request, {
    kind: "program",
    next,
    basis: basis ?? request.path,
  });
}
function evalWorld(
  id: string,
  goal: string,
  patch: Partial<RuntimeEvalInput>,
  next: EvalNext,
) {
  const request: RuntimeEvalInput = {
    kind: "eval",
    goal,
    workspace: "workshop",
    requestedWorkspace: "workshop",
    surface: "server",
    operation: "assigned-eval",
    approved: true,
    revisionCurrent: true,
    effect: "none",
    ...patch,
  };
  return task(id, "eval-custody", request, {
    kind: "eval",
    next,
    basis: request.workspace,
  });
}
function trace(
  id: string,
  goal: string,
  patch: Partial<RuntimeTraceInput>,
  next: TraceNext,
) {
  const request: RuntimeTraceInput = {
    kind: "trace",
    goal,
    channelId: `channel-${id}`,
    integrity: "ok",
    activity: "idle",
    log: "channel",
    subject: "health",
    coordinatesMatched: true,
    boundedObservation: false,
    callerOnly: false,
    ...patch,
  };
  return task(id, "gad-context", request, {
    kind: "trace",
    next,
    basis: request.channelId,
    integrity: request.integrity,
    activity: request.callerOnly ? "idle" : request.activity,
  });
}
const call = {
  id: "nl-retained-3",
  status: "failed" as const,
  outputChecked: false,
  exactSameInput: true,
};

export const runtimeEvidenceWorlds = [
  program(
    "typed-source-needs-compile",
    "I've authored a typed natural-language function. What should I check before running it?",
    { compiler: "unchecked" },
    "compile",
  ),
  program(
    "nested-helper-is-out-of-scope",
    "The exact compiler record says the nested function cannot see a helper in another callable folder.",
    { compiler: "failed", diagnostic: "callable-scope" },
    "repair-callable-scope",
  ),
  program(
    "document-result-different-type",
    "The report signature disagrees with the shape the author returned. Identify the repair boundary.",
    { compiler: "failed", diagnostic: "result-type" },
    "repair-result-contract",
  ),
  program(
    "explicit-service-was-omitted",
    "The function's narrowly scoped declaration requires an unavailable binding in this eval.",
    { compiler: "failed", diagnostic: "unavailable-service" },
    "bind-declared-service",
  ),
  program(
    "no-npm-import-map",
    "The inline program could not resolve an npm import while checking its signature.",
    { compiler: "failed", diagnostic: "missing-import" },
    "resolve-import",
  ),
  program(
    "unclassified-build-error",
    "Prepare a diagnosis for a compile failure with no recognized category.",
    { compiler: "failed", diagnostic: "other" },
    "read-diagnostic",
  ),
  program(
    "only-signatures-checked",
    "The compile readback has the expected signature. No model call was attempted yet.",
    {},
    "call-reviewed-signature",
  ),
  program(
    "turn-still-running",
    "Review whether the observed typed run already has final output.",
    { call: { ...call, status: "running" } },
    "await-call",
    call.id,
  ),
  program(
    "failure-no-retry",
    "Inspect a failed invocation before another call is made.",
    { call },
    "inspect-trace",
    call.id,
  ),
  program(
    "explicit-retained-input-rerun",
    "I explicitly ask you to rerun this exact failed call with its retained inputs.",
    { call, userRequestedRetry: true },
    "rerun-exact-input",
    call.id,
  ),
  program(
    "rerun-inputs-moved",
    "I asked for a retry but the retained record contains a different request basis.",
    { call: { ...call, exactSameInput: false }, userRequestedRetry: true },
    "inspect-trace",
    call.id,
  ),
  program(
    "unchecked-valid-type-return",
    "The function returned an object matching its type. Assess whether the actual result has been verified.",
    { call: { ...call, status: "returned" } },
    "inspect-trace",
    call.id,
  ),
  program(
    "verified-terminal-call",
    "Review a completed typed call with a confirmed result and the exact retained ID.",
    { call: { ...call, status: "returned", outputChecked: true } },
    "verified",
    call.id,
  ),
  evalWorld(
    "chat-cross-panel",
    "An inline chat component wants to inspect a different panel's currently rendered controls.",
    { surface: "chat-panel", operation: "other-panel" },
    "use-server-eval",
  ),
  evalWorld(
    "component-renders-itself",
    "Review a local chat UI effect already observed in its authorized component surface.",
    {
      surface: "chat-panel",
      operation: "current-panel-ui",
      effect: "observed",
    },
    "verified",
  ),
  evalWorld(
    "wrong-workspace-context",
    "I selected a separate workspace; the caller is still in the original workspace's branch.",
    { requestedWorkspace: "other-workshop" },
    "open-target-workspace",
  ),
  evalWorld(
    "shared-outside-eval",
    "The app needs durable shared data across independently running evals. Assess its current use of eval storage.",
    { operation: "shared-app-state" },
    "use-owned-service",
  ),
  evalWorld(
    "await-real-approval",
    "The assigned server-side browser read still has no approval from the owning workspace.",
    { operation: "other-panel", approved: false },
    "await-approval",
  ),
  evalWorld(
    "stale-panel-session",
    "The action points at a stale handle returned by the last panel generation.",
    { operation: "other-panel", revisionCurrent: false },
    "refresh-handle",
  ),
  evalWorld(
    "rpc-dispatch-no-result",
    "The authorized RPC produced a dispatch receipt without the actual app effect.",
    { operation: "declared-rpc", effect: "dispatched" },
    "observe-effect",
  ),
  evalWorld(
    "scoped-current-action-ready",
    "The user selected this exact assigned evaluation, with current authority and receipt. State what is ready.",
    {},
    "ready",
  ),
  trace(
    "trace-private-health-different",
    "The channel log looks quiet but health reports a broken durable integrity signal.",
    { integrity: "broken", activity: "idle", boundedObservation: true },
    "inspect-integrity",
  ),
  trace(
    "own-health-check-excluded",
    "The only in-flight turn belongs to the diagnostic observer itself, and the channel has no integrity fault.",
    { activity: "in-flight", callerOnly: true, boundedObservation: true },
    "report",
  ),
  trace(
    "open-other-turn-healthy",
    "The bounded receipt shows another observed turn still open, with good durable integrity.",
    { activity: "in-flight", boundedObservation: true },
    "report",
  ),
  trace(
    "join-by-original-coordinate",
    "Two messages share text and timestamp but their origin coordinates do not match the publication claim.",
    {
      subject: "publication",
      coordinatesMatched: false,
      boundedObservation: true,
    },
    "inspect-publication",
  ),
  trace(
    "invocation-outcome-needs-proof",
    "Find whether the exact invocation reached a terminal event.",
    { log: "trajectory", subject: "invocation" },
    "inspect-invocation",
  ),
  trace(
    "chat-turn-states",
    "Identify which bounded record can account for messages left in the open turn.",
    { subject: "turn" },
    "inspect-turn",
  ),
  trace(
    "typed-participants-roster",
    "Find which participants currently belong to the selected channel.",
    { subject: "roster" },
    "inspect-roster",
  ),
  trace(
    "large-value-by-reference",
    "Check oversized storage rows without reading their full values.",
    { subject: "storage" },
    "inspect-storage",
  ),
  trace(
    "paginate-one-channel",
    "Read a compact window of channel history with the issued cursor rather than returning the whole log.",
    { subject: "history" },
    "bounded-channel-read",
  ),
  trace(
    "tracked-file-belongs-to-vcs",
    "The question is who authored a managed source revision and what artifact changed.",
    { log: "managed-source", subject: "history" },
    "inspect-vcs",
  ),
];
export type RuntimeEvidenceWorld = (typeof runtimeEvidenceWorlds)[number];
