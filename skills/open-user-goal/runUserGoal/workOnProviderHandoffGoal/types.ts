import type {
  ConversationCard as Card, ConversationRead as Read, OutputReadback as Output,
  ProviderGoalReport as Report, ProviderPlan as Plan,
} from "./workspace/types.js";
import type { ApprovalTransitionReport as Transition } from "./authority/types.js";
import type { ConversationReport as Delivery } from "./conversation/types.js";

export type ConversationCard = Card;
export type ConversationRead = Read;
export type ProviderGoalReport = Report;
export type ProviderPlan = Plan;
export type OutputReadback = Output;
export type RetainedApproval = Transition;
export type RetainedDelivery = Delivery;
export type ResultSelection = { decisionMessage: string | null; resultMessage: string | null; read: boolean };
