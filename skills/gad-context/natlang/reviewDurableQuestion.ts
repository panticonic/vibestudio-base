import readMessages from "./reviewDurableQuestion/reviewQuestion/readMessages.js";
import interpretQuestion from "./reviewDurableQuestion/reviewQuestion/interpretQuestion.nl";
import readMembers from "./reviewDurableQuestion/reviewParticipant/readMembers.js";
import evaluateRoster from "./reviewDurableQuestion/reviewParticipant/evaluateRoster.nl";
import type {DurableQuestionReport} from "./types.js";
export default async function reviewDurableQuestion(goal:string):Promise<DurableQuestionReport>{
 const history=await readMessages(),question=await interpretQuestion(goal,history);
 const roster=await readMembers(history.receipt),participant=await evaluateRoster(goal,question,roster);
 const disposition=question.status==="current"&&participant.status==="confirmed"?"ready":"hold";
 return {historyReceipt:history.receipt,rosterReceipt:roster.receipt,channelId:history.channelId,question,participant,disposition,
  explanation:`The current question finding is ${question.status}; the requested participant finding is ${participant.status}.`};
}
