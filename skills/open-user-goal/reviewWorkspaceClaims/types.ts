export * from "./workspace/types.js";

import type {ClaimReviewChoice,ClaimPacket,ClaimEvidence,ClaimSupport} from "./workspace/types.js";

export type ClaimInquiry={choice:ClaimReviewChoice;packet:ClaimPacket|null;evidence:ClaimEvidence|null;support:ClaimSupport|null};
