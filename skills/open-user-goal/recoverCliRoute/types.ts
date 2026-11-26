import type { CliContinuation, RemoteRouteReview } from "./remote/types.js";

export type CliDocket = { id: string; name: string; revision: string; current: boolean };
export type CliRouteFindings = { gateway: RemoteRouteReview | null; continuation: CliContinuation | null; explanation: string };
export type CliDocketEvidence = {
  docket: CliDocket;
  request: { goal: string; operationId: string; serverId: string; workspaceId: string };
};

export type CliContinuationInquiry={selected:CliDocketEvidence|null;gateway:RemoteRouteReview|null;continuation:CliContinuation|null};
