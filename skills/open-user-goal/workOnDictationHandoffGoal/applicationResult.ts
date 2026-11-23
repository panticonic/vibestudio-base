import type {DictationResult,DictationPlan,DictationDraftWitness,DictationArtifact} from "./types.js";
export default function applicationResult(plan:DictationPlan,review:DictationDraftWitness|null,handoff:DictationArtifact|null):DictationResult {return {plan,review:review?.result??null,handoff};}
