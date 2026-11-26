import type { UnitReview } from "./reviewDesign/installed/types.js";
import type { UnitIdentityReport, UnitIdentityChange } from "./reviewIdentity/installed/types.js";
import type { UnitHandoffUnit, UnitHandoffPlan, UnitHandoffObservation, UnitLifecycleObservation } from "./contract.js";
export type { UnitReview, UnitIdentityReport, UnitIdentityChange };
export type { UnitHandoffUnit, UnitHandoffPlan, UnitHandoffObservation, UnitLifecycleObservation } from "./contract.js";

export type UnitLifecycleFinding = {
  observation: UnitLifecycleObservation;
  source: "working" | "protected-main" | "unverified";
  activity: "active" | "approval-pending" | "blocked" | "inactive" | "in-progress";
  reason: string;
};
export type UnitDesignHandoff = {
  manifest: "protected-match" | "local-only" | "invalid" | "missing" | "not-applicable";
  native: UnitReview | null;
  lifecycle: UnitLifecycleFinding | null;
};
export type UnitHandoffFindings = { explanation:string; unit:UnitHandoffUnit|null; draft:UnitIdentityChange|null };
export type UnitHandoffInquiry = { inventory:UnitHandoffUnit[]; plan:UnitHandoffPlan; observation:UnitHandoffObservation|null; design:UnitDesignHandoff|null };
