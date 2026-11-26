export * from "./project/types.js";

import type {BridgePlan,DeliveryScope,LocalGitReview,LocalFileReview,BranchAssessment} from "./project/types.js";

export type BridgeInquiry={plan:BridgePlan;scope:DeliveryScope|null;local:LocalGitReview|null;spec:LocalFileReview|null;note:LocalFileReview|null;branch:BranchAssessment|null};
