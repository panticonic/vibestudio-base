export type RuntimeProgramInput = {
  kind: "program";
  goal: string;
  path: string;
  compiler: "unchecked" | "passed" | "failed";
  diagnostic:
    | "callable-scope"
    | "result-type"
    | "unavailable-service"
    | "missing-import"
    | "other"
    | null;
  call: null | {
    id: string;
    status: "returned" | "failed" | "running";
    outputChecked: boolean;
    exactSameInput: boolean;
  };
  userRequestedRetry: boolean;
  execution?: {
    id: string;
    state: "verified" | "unchecked" | "failed" | "stale";
  };
};
export type RuntimeEvalInput = {
  kind: "eval";
  goal: string;
  workspace: string;
  requestedWorkspace: string;
  surface: "server" | "chat-panel";
  operation:
    | "current-panel-ui"
    | "other-panel"
    | "shared-app-state"
    | "assigned-eval"
    | "declared-rpc";
  approved: boolean;
  revisionCurrent: boolean;
  effect: "observed" | "dispatched" | "none";
};
export type RuntimeTraceInput = {
  kind: "trace";
  goal: string;
  channelId: string;
  integrity: "ok" | "broken";
  activity: "idle" | "in-flight";
  log: "trajectory" | "channel" | "managed-source";
  subject:
    | "health"
    | "turn"
    | "invocation"
    | "publication"
    | "roster"
    | "storage"
    | "history";
  coordinatesMatched: boolean;
  boundedObservation: boolean;
  callerOnly: boolean;
};
export type RuntimeEvidenceRequest =
  | RuntimeProgramInput
  | RuntimeEvalInput
  | RuntimeTraceInput;
export type ProgramNext =
  | "compile"
  | "repair-callable-scope"
  | "repair-result-contract"
  | "bind-declared-service"
  | "resolve-import"
  | "read-diagnostic"
  | "call-reviewed-signature"
  | "inspect-trace"
  | "await-call"
  | "rerun-exact-input"
  | "refresh-program-receipt"
  | "verified";
export type EvalNext =
  | "use-server-eval"
  | "open-target-workspace"
  | "use-owned-service"
  | "await-approval"
  | "refresh-handle"
  | "observe-effect"
  | "ready"
  | "verified";
export type TraceNext =
  | "inspect-integrity"
  | "inspect-turn"
  | "inspect-invocation"
  | "inspect-publication"
  | "inspect-roster"
  | "inspect-storage"
  | "bounded-channel-read"
  | "inspect-vcs"
  | "report";
export type RuntimeEvidenceReport =
  | { kind: "program"; next: ProgramNext; basis: string }
  | { kind: "eval"; next: EvalNext; basis: string }
  | {
      kind: "trace";
      next: TraceNext;
      integrity: "ok" | "broken";
      activity: "idle" | "in-flight";
      basis: string;
    };
