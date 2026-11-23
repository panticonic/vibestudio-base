declare module "natlang:services" {
  export const scheduledMission: {
    discover(): Promise<import("./types.js").Schedule[]>;
    observe(id: string): Promise<import("./types.js").Schedule>;
    change(schedule: import("./types.js").Schedule, change: import("./types.js").Change, authorization: import("./types.js").Receipt): Promise<import("./types.js").Resolution>;
  };
  export const scheduledHistory: {
    discover(): Promise<import("./types.js").Lane[]>;
    read(lane: string): Promise<import("./types.js").Receipt[]>;
  };
  export const scheduledHandoff: {
    submit(schedule: import("./types.js").Schedule, authorization: import("./types.js").Receipt, lane: import("./types.js").Lane): Promise<import("./types.js").Submission>;
    read(submission: import("./types.js").Submission): Promise<import("./types.js").Receipt | null>;
  };
}
