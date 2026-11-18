export type Role = "impact" | "recovery" | "release";
export type Signal = { id: string; text: string };
export type Gate = { id: string; state: "approved" | "pending" | "rejected" };
export type Request =
 | { kind: "incident-handoff"; goal: string; signals: Signal[] }
 | { kind: "release-continuation"; goal: string; before: Gate[]; after: Gate[] };
export type Assignment = { role: "impact" | "recovery"; signalIds: string[]; instruction: string };
export type Assessment = { role: Role; evidenceIds: string[]; decision: "ready" | "blocked"; reason: string };
export type OwnedHandle = { id: string; contextId: string; targetId: string; role: Role };
export type Checkpoint = { revision: number; assessment: Assessment };
export type Snapshot = { revision: number; checkpoints: Checkpoint[] };
export type Handoff = { decision: "ready" | "blocked"; evidenceIds: string[]; summary: string };
export type Report = { kind: Request["kind"]; handoff: Handoff; handles: OwnedHandle[]; cleanup: { retiredIds: string[]; destroyedContextIds: string[] } };
export interface OwnedOperations {
 open(role: Role): Promise<OwnedHandle>;
 append(handle: OwnedHandle, expectedRevision: number, assessment: Assessment): Promise<Snapshot>;
 read(handle: OwnedHandle): Promise<Snapshot>;
 restart(handle: OwnedHandle): Promise<Snapshot>;
 close(): Promise<{ retiredIds: string[]; destroyedContextIds: string[] }>;
}

