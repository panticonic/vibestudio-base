export type PanelRequest = { panelSource: string; goal: string };

export type PanelReport = {
  status: "verified" | "blocked";
  detail: string;
  revision: string;
  evidence: string[];
};

export type UnitRequest = { unit: string; suite: string; goal: string };

export type UnitReport = {
  status: "verified" | "blocked";
  revision: string;
  detail: string;
  evidence: string[];
};

import type { ContentRequest, ContentReview } from "./runWorkflow/deliverProject/types.js";
export type { ContentFact, ContentRequest, ContentReview } from "./runWorkflow/deliverProject/types.js";

export type ContentReport = {
  status: "committed" | "blocked";
  repoPath: string;
  eventId: string | null;
  head: string;
  pages: string[];
  review: ContentReview | null;
  reason: string;
};

export type IntegrationRequest = { goal: string };

export type IntegrationReport = {
  status: "integrated" | "blocked";
  head: string;
  evidence: string[];
  detail: string;
};

import type { OperationsRequest, OperationsReport } from "./runWorkflow/operate/types.js";

export type {
  OperationsRole,
  OperationsSignal,
  OperationsGate,
  OperationsRequest,
  OperationsOwnedHandle,
  OperationsHandoff,
  OperationsWorkflowKind,
  OperationsReport,
} from "./runWorkflow/operate/types.js";

export type MessagingRequest = {
  recipientPhrase: string;
  goal: string;
  facts: string[];
};

export type MessagingReport = {
  status: "delivered" | "held" | "blocked";
  recipientRef: string | null;
  messageId: string | null;
  content: string | null;
  clarification: string | null;
  evidence: string[];
};

export type AssignedWork =
  | { kind: "domain"; domain: string; operation: string; input: unknown }
  | { kind: "repairPanel"; input: PanelRequest }
  | { kind: "repairUnit"; input: UnitRequest }
  | { kind: "deliverProject"; input: ContentRequest }
  | { kind: "integrateWorkspace"; input: IntegrationRequest }
  | { kind: "operate"; input: OperationsRequest }
  | { kind: "routeMessage"; input: MessagingRequest };

export type WorkResult =
  | { kind: "domain"; domain: string; operation: string; report: unknown }
  | { kind: "repairPanel"; report: PanelReport }
  | { kind: "repairUnit"; report: UnitReport }
  | { kind: "deliverProject"; report: ContentReport }
  | { kind: "integrateWorkspace"; report: IntegrationReport }
  | { kind: "operate"; report: OperationsReport }
  | { kind: "routeMessage"; report: MessagingReport };

export type WorkflowRequest = { goal: string; work: AssignedWork[] };
export type WorkflowReport = { results: WorkResult[]; remaining: string[] };
