export * from "./workspace/types.js";

import type {RevisionScope,RevisionAuthority,RevisionPlan} from "./workspace/types.js";
export type RevisionInvestigation={scope:RevisionScope;authority:RevisionAuthority;plan:RevisionPlan};
