import {nativeMemoryHandoff} from "natlang:services";
import type {MemoryBrief, MemoryEvidence, MemoryNote, MemoryOutcome, MemoryPlan} from "./types.js";
/** Record authorized local findings and exact citations. */
export default async function stageMemoryHandoff(brief: MemoryBrief, plan: MemoryPlan, evidence: MemoryEvidence, outcome: MemoryOutcome):Promise<MemoryNote | null>{
 return nativeMemoryHandoff.stage(brief, plan, evidence, outcome);
}
