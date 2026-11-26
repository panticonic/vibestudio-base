import type {
  ConversationCard as Card, ConversationRead as Read, OutputReadback as Output,
  ProviderGoalReport as Report, ProviderPlan as Plan, ProviderHandoff,
} from "./workspace/types.js";
import type { ApprovalTransitionReport as Transition, ApprovalTransitionRequest } from "./reviewRetainedApproval/authority/types.js";
import type { ConversationReport as Delivery, DeliveryInput } from "./reviewRetainedDelivery/conversation/types.js";

export type ConversationCard = Card;
export type ConversationRead = Read;
export type ProviderHistory = {opening:ConversationRead;current:ConversationRead};
export type ProviderGoalReport = Report & {
  reviews: { approval: ApprovalReviewEvidence; delivery: DeliveryReviewEvidence };
};
export type ProviderPlan = Plan;
export type OutputReadback = Output;
export type RetainedApproval = Transition;
export type RetainedDelivery = Delivery;
export type ApprovalReviewEvidence = { request: ApprovalTransitionRequest; result: RetainedApproval };
export type DeliveryReviewEvidence = { request: DeliveryInput; result: RetainedDelivery };
export type ResultSelection = { decisionMessage: string | null; resultMessage: string | null; read: boolean };

export type {ProviderHandoff};
export type ProviderResult = {plan:ProviderPlan;handoff:ProviderHandoff|null};
