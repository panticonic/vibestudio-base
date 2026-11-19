import type { OperationsRole, OperationsOwnedHandle } from "../../types.js";

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
