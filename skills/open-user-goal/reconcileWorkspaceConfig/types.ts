export * from "./settings/types.js";

import type {ConfigBrief,ConfigLens,ConfigEvidence,ConfigOutcome} from "./settings/types.js";

export type ConfigInquiry={brief:ConfigBrief;lens:ConfigLens;evidence:ConfigEvidence|null;outcome:ConfigOutcome|null};
