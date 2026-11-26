export * from "./workspace/types.js";

import type {ImagePlan,ImageAssessment,ImageRead} from "./workspace/types.js";
export type ImageInvestigation = {plan:ImagePlan|null; assessment:ImageAssessment; reads:ImageRead[]};
