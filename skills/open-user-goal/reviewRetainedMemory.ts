import identifyMemoryScope from "./reviewRetainedMemory/evidence/identifyMemoryScope.js";
import stageMemoryHandoff from "./reviewRetainedMemory/evidence/stageMemoryHandoff.js";
import chooseMemorySearch from "./reviewRetainedMemory/chooseMemorySearch.nl";
import resolveMemoryEvidence from "./reviewRetainedMemory/resolveMemoryEvidence.js";
import judgeMemoryClaim from "./reviewRetainedMemory/judgeMemoryClaim.nl";
import shouldRetainMemoryFinding from "./reviewRetainedMemory/shouldRetainMemoryFinding.nl";
import applicationResult from "./reviewRetainedMemory/applicationResult.js";
import type {MemoryResult} from "./reviewRetainedMemory/types.js";
export default async function reviewRetainedMemory(goal:string):Promise<MemoryResult>{
 const brief=await identifyMemoryScope(),plan=await chooseMemorySearch(goal,brief);
 const evidence=await resolveMemoryEvidence(brief,plan),outcome=await judgeMemoryClaim(goal,plan,evidence);
 const handoff=await shouldRetainMemoryFinding(goal,brief,outcome)?await stageMemoryHandoff(brief,plan,evidence,outcome):null;
 return applicationResult(outcome,handoff);
}
