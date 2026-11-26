export * from "./workspace/types.js";

import type {WelcomeIndex,WelcomeChoice,WelcomeSnapshot,WelcomeResolution,WelcomeEvidence,WelcomeReviews} from "./workspace/types.js";

export type WelcomeInquiry={index:WelcomeIndex;choice:WelcomeChoice;earlier:WelcomeSnapshot|null;current:WelcomeSnapshot|null;resolved:WelcomeResolution|null;evidence:WelcomeEvidence|null;reviews:WelcomeReviews};
