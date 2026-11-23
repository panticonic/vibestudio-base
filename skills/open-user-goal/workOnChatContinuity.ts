import discoverChatContinuity from "./workOnChatContinuity/workspace/discoverChatContinuity.js";
import observeChatContinuity from "./workOnChatContinuity/workspace/observeChatContinuity.js";
import stageChatContinuityNote from "./workOnChatContinuity/workspace/stageChatContinuityNote.js";
import chooseChatContinuity from "./workOnChatContinuity/chooseChatContinuity.nl";
import reviewChatContinuity from "./workOnChatContinuity/reviewChatContinuity.js";
import decideChatContinuity from "./workOnChatContinuity/decideChatContinuity.nl";
import applicationResult from "./workOnChatContinuity/applicationResult.js";
import type {ChatResult,ChatContinuityReport} from "./workOnChatContinuity/types.js";

/** Read current native frontiers, ask the installed delivery policy, and retain only an admitted note. */
export default async function workOnChatContinuity(goal:string):Promise<ChatResult>{
 const index=await discoverChatContinuity(),plan=await chooseChatContinuity(goal,index);
 const opening=await observeChatContinuity(plan.channelId),current=await observeChatContinuity(plan.channelId);
 if(!opening||!current)throw new Error("The selected owned chat frontier is unavailable");
 const evidence=await reviewChatContinuity(goal,index,plan,opening,current);
 const disposition=await decideChatContinuity(goal,plan,opening,current,evidence);
 const record:ChatContinuityReport={plan,opening,current,evidence,disposition,handoff:null};
 const handoff=disposition.write?await stageChatContinuityNote(record):null;
 return applicationResult(evidence.review,disposition,handoff);
}
