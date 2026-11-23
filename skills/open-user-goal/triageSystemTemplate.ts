import findSystemCandidate from "./triageSystemTemplate/findSystemCandidate.nl";
import readCandidateEvidence from "./triageSystemTemplate/readCandidateEvidence.nl";
import planCandidateHandoff from "./triageSystemTemplate/planCandidateHandoff.nl";
import checkCandidateCurrent from "./triageSystemTemplate/checkCandidateCurrent.js";
import holdMovedCandidate from "./triageSystemTemplate/holdMovedCandidate.nl";
import recordCandidateHandoff from "./triageSystemTemplate/recordCandidateHandoff.js";
import verifyCandidateHandoff from "./triageSystemTemplate/verifyCandidateHandoff.js";
import finishCandidateHandoff from "./triageSystemTemplate/finishCandidateHandoff.js";
import type {SystemCandidateOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function triageSystemTemplate(goal:string):Promise<SystemCandidateOutcome>{
 const card=await findSystemCandidate(goal);
 const {preview}=await readCandidateEvidence(goal,card);
 let plan=await planCandidateHandoff(goal,card,preview);
 const gate=await checkCandidateCurrent(card.id,card.workingEvent,preview.coordinate.id);
 if(!gate.current)plan=await holdMovedCandidate(plan,gate);
 const receipt=gate.current&&plan.record?await recordCandidateHandoff(card.id,card.workingEvent,preview.coordinate.id,plan):null;
 await verifyCandidateHandoff(card.id,receipt?.path??null);
 return finishCandidateHandoff(plan,receipt);
}
