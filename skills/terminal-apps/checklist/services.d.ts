import type { ChecklistScreen, ItemKey } from "./types.js";
declare module "natlang:services" {
  export const checklistOpen: { launch(): Promise<ChecklistScreen> };
  export const checklistKeys: {
    toggle(key: ItemKey): Promise<ChecklistScreen>;
  };
  export const checklistResume: {
    resume(kind: "reattach" | "restart"): Promise<ChecklistScreen>;
  };
}
