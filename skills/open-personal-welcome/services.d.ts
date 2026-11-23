declare module "natlang:services" {
  export const welcomeResourceIndex: { list(): Promise<import("./types.js").WelcomeIndex> };
  export const welcomeReceiptStore: { read(channelId: string): Promise<import("./types.js").WelcomeSnapshot | null> };
  export const welcomeResourceResolution: { resolve(resourceId: string): Promise<import("./types.js").WelcomeResolution | null> };
  export const welcomeLocalHandoff: { stage(plan: import("./types.js").WelcomePlan, reviews: import("./types.js").WelcomeReviews): Promise<import("./types.js").WelcomeHandoff | null> };
}
