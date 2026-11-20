import type { WelcomeHandoff, WelcomeIndex, WelcomePlan, WelcomeResolution, WelcomeReviews, WelcomeSnapshot } from "./types.js";

declare module "natlang:services" {
  export const welcomeResourceIndex: { list(): Promise<WelcomeIndex> };
  export const welcomeReceiptStore: { read(channelId: string): Promise<WelcomeSnapshot | null> };
  export const welcomeResourceResolution: { resolve(resourceId: string): Promise<WelcomeResolution | null> };
  export const welcomeLocalHandoff: { stage(plan: WelcomePlan, reviews: WelcomeReviews): Promise<WelcomeHandoff | null> };
}
