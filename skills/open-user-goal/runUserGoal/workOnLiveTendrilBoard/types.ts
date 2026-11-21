export type { TendrilRequest } from "./workflow/types.js";
import type { TendrilReport, TendrilRequest } from "./workflow/types.js";

export type LiveTendrilCard = { id: string; title: string; edition: "current" | "archive" };
export type LiveTendrilTicket = {
  card: LiveTendrilCard;
  platform: "headless";
  fields: { key: string; shape: string }[];
  controls: { name: string; key: string; value: string | number | boolean }[];
  layouts: { candidate: string; build: string; heading: string }[];
};
export type LiveTendrilOutcome = {
  card: LiveTendrilCard | null;
  plan: TendrilRequest | null;
  actual: TendrilReport | null;
  reason: string;
};
