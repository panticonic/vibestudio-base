export * from "./workspace/types.js";

import type {ChatIndex,ChatPlan,ChatObservation,ChatEvidence} from "./workspace/types.js";

export type ChatInquiry={index:ChatIndex;plan:ChatPlan;opening:ChatObservation|null;current:ChatObservation|null;evidence:ChatEvidence|null};
