import type { CliContinuation, RemoteRouteReview } from "./remote/types.js";

export type CliDocket = { id: string; name: string; revision: string; current: boolean };
export type CliRouteOutcome = { status: "reviewed" | "held"; gateway: RemoteRouteReview | null; continuation: CliContinuation | null; reason: string };
export type CliDocketEvidence = {
  docket: CliDocket;
  request: { goal: string; operationId: string; serverId: string; workspaceId: string };
};
