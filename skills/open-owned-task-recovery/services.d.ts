declare module "natlang:services" {
  export const ownedTaskBoard: {
    discover(): Promise<import("./types.js").TaskOption[]>;
    observe(id: string): Promise<import("./types.js").TaskView>;
    transition(id: string, revision: number, status: import("./types.js").TaskStatus): Promise<import("./types.js").UpdateTaskResult>;
  };
  export const ownedTaskAttempts: {
    discover(): Promise<import("./types.js").OwnerLane[]>;
    readArtifact(task: string, revision: number, room: string, basis: string): Promise<import("./types.js").TaskArtifact>;
    inspect(room: string, recipient: string | null): Promise<import("./types.js").LaneObservation>;
  };
  export const ownedTaskHandoff: {
    submit(task: string, revision: number, basis: string, content: string): Promise<import("./types.js").HandoffAttempt>;
    read(attemptId: string): Promise<import("./types.js").MessageReceipt | null>;
  };
}
