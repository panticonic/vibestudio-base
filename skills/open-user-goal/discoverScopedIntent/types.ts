export * from "./workspace/types.js";

import type {IntentNotice,IntentDescription,IntentPlan,IntentObservation} from "./workspace/types.js";

export type IntentInquiry={notice:IntentNotice;capabilities:IntentDescription[];plan:IntentPlan;evidence:IntentObservation[]};
