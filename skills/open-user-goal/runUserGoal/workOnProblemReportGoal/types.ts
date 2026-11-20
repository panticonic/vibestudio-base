export type IncidentCard = {
  id: string;
  title: string;
  surface: string;
  state: "current" | "archived" | "recovered";
  observation: string;
};
export type OpenProblemOutcome = { incident: string | null; draft: unknown };
