import reviewConversation from "./reviewChatContinuity/policy/reviewConversation.nl";
import type {ChatIndex,ChatPlan,ChatObservation,ChatEvidence,DeliveryReview} from "./types.js";

/** Compute native identity/count facts in TypeScript; the installed policy still judges delivery readiness. */
export default async function reviewChatContinuity(goal:string,index:ChatIndex,plan:ChatPlan,opening:ChatObservation,current:ChatObservation):Promise<ChatEvidence>{
 const {receipt,worker,consumer}=current;
 const durable=current.rows.filter(row=>row.id===receipt.messageId),original=durable[0];
 const projected=consumer.rows.filter(row=>row.id===receipt.messageId),visible=projected[0];
 const scope=consumer.channelId===current.channelId;
 const matched=scope&&consumer.settled&&projected.length===1&&!!visible&&visible.sender===receipt.senderId&&visible.text===receipt.text;
 const request:DeliveryReview={kind:"delivery",goal,channelId:plan.channelId,
  channelAccepted:receipt.channelId===current.channelId&&!!original,
  originMatched:receipt.channelId===current.channelId&&!!original&&original.sender===receipt.senderId&&original.text===receipt.text,
  durableCount:durable.length,recipientsResolved:scope,
  membershipVerified:plan.requireWorker?!!worker?.active&&worker.objectKey===index.openingWorker?.objectKey&&worker.participantId===index.openingWorker?.participantId:scope,
  replayMeaningMatches:matched,settlement:!consumer.settled?"pending":matched?"delivered":"failed",
  accountedRetry:!current.retryId||current.retryId===receipt.messageId};
 const reviewed=await reviewConversation(request);
 if(reviewed.kind!=="delivery")throw new Error("The installed conversation review returned a different evidence kind");
 return {request,review:{kind:"delivery",basis:reviewed.basis,blockers:reviewed.blockers,ready:reviewed.ready}};
}
