declare module "natlang:services" {
  export const authoringDiscovery: {
    list(): Promise<import("./types.js").AuthoringSource[]>;
    open(goal: string, selection: import("./types.js").AuthoringSelection): Promise<import("./types.js").SelectedAuthoring | null>;
  };
  export const authoringReviewControl: {
    confirm(receipt: import("./types.js").AuthoringReceipt): Promise<"current" | "changed">;
    stage(receipt: import("./types.js").AuthoringReceipt): Promise<import("./types.js").AuthoringHandoff | null>;
  };
}
