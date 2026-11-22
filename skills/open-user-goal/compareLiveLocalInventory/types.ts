export type { LocalTaskRequest } from "./installed/types.js";
import type { LocalTaskReport, LocalTaskRequest } from "./installed/types.js";

export type LocalInventoryCard = { id: string; title: string; current: boolean };
export type LocalInventoryDocket = {
  card: LocalInventoryCard;
  preferences: { ref: string; label: string }[];
  purpose: string;
};
export type LocalInventoryOutcome = {
  card: LocalInventoryCard | null;
  plan: LocalTaskRequest | null;
  report: LocalTaskReport | null;
  reason: string;
};
