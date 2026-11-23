declare module "natlang:services" {
  export const checklistOpen: { launch(): Promise<import("./types.js").ChecklistScreen> };
  export const checklistKeys: {
    toggle(key: import("./types.js").ItemKey): Promise<import("./types.js").ChecklistScreen>;
  };
  export const checklistResume: {
    resume(kind: "reattach" | "restart"): Promise<import("./types.js").ChecklistScreen>;
  };
}
