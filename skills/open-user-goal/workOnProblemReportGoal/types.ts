import type { SaveProblemResult } from "./reporter/types.js";
export type IncidentCard = {
  id: string;
  title: string;
  surface: string;
  state: "current" | "archived" | "recovered";
  observation: string;
};
export type OpenProblemOutcome = SaveProblemResult | null;
