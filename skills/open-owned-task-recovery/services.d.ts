import type {
  HandoffAttempt, LaneObservation, MessageReceipt, OwnerLane, TaskOption, TaskStatus,
  TaskView, UpdateTaskResult,
} from "./types.js";
declare module "natlang:services" {
  export const ownedTaskBoard: {
    discover(): Promise<TaskOption[]>;
    observe(id: string): Promise<TaskView>;
    transition(id: string, revision: number, status: TaskStatus): Promise<UpdateTaskResult>;
  };
  export const ownedTaskAttempts: {
    discover(): Promise<OwnerLane[]>;
    inspect(room: string, recipient: string | null): Promise<LaneObservation>;
  };
  export const ownedTaskHandoff: {
    submit(task: string, revision: number, basis: string, content: string): Promise<HandoffAttempt>;
    read(attemptId: string): Promise<MessageReceipt | null>;
  };
}
