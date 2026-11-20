import type { Change, Lane, Receipt, Resolution, Schedule, Submission } from "./types.js";

declare module "natlang:services" {
  export const scheduledMission: {
    discover(): Promise<Schedule[]>;
    observe(id: string): Promise<Schedule>;
    change(schedule: Schedule, change: Change, authorization: Receipt): Promise<Resolution>;
  };
  export const scheduledHistory: {
    discover(): Promise<Lane[]>;
    read(lane: string): Promise<Receipt[]>;
  };
  export const scheduledHandoff: {
    submit(schedule: Schedule, authorization: Receipt, lane: Lane): Promise<Submission>;
    read(submission: Submission): Promise<Receipt | null>;
  };
}
