export type TaskStatus = "inbox" | "ready" | "active" | "review" | "done" | "cancelled";
export type TaskOption = { id: string; project: string; title: string };
export type TaskView = {
  task: TaskOption;
  revision: number;
  status: TaskStatus;
  owner: string;
  attempt: string;
  artifact: string;
  work: string;
  allowed: TaskStatus[];
  prerequisites: { title: string; status: TaskStatus; revision: number }[];
};
export type TaskArtifactRef = { digest: string; mediaType: string };
export type TaskArtifact = { name: string; reference: TaskArtifactRef; content: string };
export type AttemptRecord = {
  taskId: string;
  task: string;
  owner: string;
  attempt: string;
  artifact: string;
  artifactRef?: TaskArtifactRef;
  phase: "failed" | "cancelled" | "draft" | "ready" | "accepted";
};
export type MessageReceipt = {
  roomId: string; channelId: string; messageId: string; senderId: string;
  recipientRef: string; content: string; sequence: number; acknowledged: boolean;
};
export type OwnerLane = { id: string; title: string; maySend: boolean };
export type LaneObservation = {
  lane: OwnerLane;
  basis: string;
  /** Resolved owner only when explicitly requested by the inspector; the receipt retains its actual recipient. */
  owner: string | null;
  receipt: MessageReceipt | null;
  record: AttemptRecord | null;
};
export type ReviewedAttempts = { terminal: LaneObservation | null; lanes: LaneObservation[] };
export type UpdateTaskResult = { status: "applied" | "changed" | "held"; task: TaskView };
export type TaskResolution = { status: TaskStatus | null; reason: string };
export type HandoffAttempt = { attemptId: string; response: "submitted" | "interrupted" };
export type OwnerDelivery = { attempt: HandoffAttempt; readback: MessageReceipt | null };
export type RecoveryReport = {
  /** Actual retained output, when requested and available; never inferred from a filename. */
  result?: TaskArtifact;
  task: string;
  revision: number;
  status: TaskStatus;
  original: MessageReceipt | null;
  delivery: OwnerDelivery | null;
  reason: string;
} | { task: null; reason: string };
