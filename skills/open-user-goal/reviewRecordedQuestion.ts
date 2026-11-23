import discoverRecordedQuestion from "./reviewRecordedQuestion/discoverRecordedQuestion.js";
import chooseSearchPhrase from "./reviewRecordedQuestion/chooseSearchPhrase.nl";
import findRecordedProposal from "./reviewRecordedQuestion/findRecordedProposal.nl";
import selectRecordedProposal from "./reviewRecordedQuestion/selectRecordedProposal.nl";
import collectRecordedEvidence from "./reviewRecordedQuestion/collectRecordedEvidence.nl";
import answerRecordedQuestion from "./reviewRecordedQuestion/answerRecordedQuestion.nl";
import type {RecordedQuestionReport} from "./reviewRecordedQuestion/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewRecordedQuestion(goal:string):Promise<RecordedQuestionReport>{
 const assignment=await discoverRecordedQuestion();
 const phrase=await chooseSearchPhrase(goal);
 const candidates=await findRecordedProposal(assignment,phrase);
 const selection=await selectRecordedProposal(assignment,candidates);
 const evidence=selection.ref?await collectRecordedEvidence(assignment,selection.ref):null;
 return answerRecordedQuestion(assignment,candidates,selection,evidence);
}
