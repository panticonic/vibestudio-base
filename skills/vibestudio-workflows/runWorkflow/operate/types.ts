export type OperationsRole = "impact" | "recovery" | "release";

export type OperationsSignal = { id: string; text: string };

export type OperationsGate = {
  id: string;
  state: "approved" | "pending" | "rejected";
};

export type OperationsRequest =
  | { kind: "incident-handoff"; goal: string; signals: OperationsSignal[] }
  | {
      kind: "release-continuation";
      goal: string;
      before: OperationsGate[];
      after: OperationsGate[];
    };

export type OperationsOwnedHandle = {
  id: string;
  contextId: string;
  targetId: string;
  role: OperationsRole;
};

export type OperationsHandoff = {
  decision: "ready" | "blocked";
  evidenceIds: string[];
  summary: string;
};

export type OperationsWorkflowKind =
  | "incident-handoff"
  | "release-continuation";

export type OperationsReport = {
  kind: OperationsWorkflowKind;
  handoff: OperationsHandoff;
  handles: OperationsOwnedHandle[];
  cleanup: { retiredIds: string[]; destroyedContextIds: string[] };
};

export type Assignment = {
  role: "impact" | "recovery";
  signalIds: string[];
  instruction: string;
};
export type Assessment = {
  role: OperationsRole;
  evidenceIds: string[];
  decision: "ready" | "blocked";
  reason: string;
};
export type Checkpoint = { revision: number; assessment: Assessment };
export type Snapshot = { revision: number; checkpoints: Checkpoint[] };
export interface OwnedOperations {
  open(role: OperationsRole): Promise<OperationsOwnedHandle>;
  append(
    handle: OperationsOwnedHandle,
    expectedRevision: number,
    assessment: Assessment,
  ): Promise<Snapshot>;
  read(handle: OperationsOwnedHandle): Promise<Snapshot>;
  restart(handle: OperationsOwnedHandle): Promise<Snapshot>;
  close(): Promise<{ retiredIds: string[]; destroyedContextIds: string[] }>;
}
