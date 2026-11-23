import type { AndroidAuditReport, AndroidAuditRequest } from "./installed/types.js";

export type { AndroidAuditRequest } from "./installed/types.js";
export type AndroidGoalAuditScope = { operationId: string; target: string };
export type AndroidGoalAuditReport = AndroidAuditReport;
