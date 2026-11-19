import type {
  AutomationPlanningRequest,
  AutomationPlanningSnapshot,
  AutomationRequest,
} from "../types.js";

export default function projectPlanningRequest(
  request: AutomationPlanningRequest,
  before: AutomationPlanningSnapshot,
): AutomationRequest {
  return {
    goal: request.goal,
    timezone: request.timezone,
    now: request.now,
    visible: before.visible.map(({ id, name, state, latestRun }) => ({
      id,
      name,
      state,
      latestRun,
    })),
    availableOperations: [],
  };
}
