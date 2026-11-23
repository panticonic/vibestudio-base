import listClaimScopes from "./reviewWorkspaceClaims/workspace/listClaimScopes.js";
import readClaimPacket from "./reviewWorkspaceClaims/workspace/readClaimPacket.js";
import readClaimEvidence from "./reviewWorkspaceClaims/workspace/readClaimEvidence.js";
import writeClaimNote from "./reviewWorkspaceClaims/workspace/writeClaimNote.js";
import selectClaimPacket from "./reviewWorkspaceClaims/selectClaimPacket.nl";
import verifyClaimSupport from "./reviewWorkspaceClaims/verifyClaimSupport.js";
import summarizeClaimReview from "./reviewWorkspaceClaims/summarizeClaimReview.nl";
import applicationResult from "./reviewWorkspaceClaims/applicationResult.js";
import type {ClaimResult,WorkspaceClaimReview} from "./reviewWorkspaceClaims/types.js";
export default async function reviewWorkspaceClaims(goal:string):Promise<ClaimResult|null>{
 const choice=await selectClaimPacket(goal,await listClaimScopes());
 const packet=await readClaimPacket(choice.id);
 if(!packet)return null;
 const evidence=await readClaimEvidence(choice.id);
 if(!evidence||evidence.packetId!==packet.id)return null;
 const support=await verifyClaimSupport(packet,evidence),disposition=await summarizeClaimReview(goal,packet,evidence,support);
 const report:WorkspaceClaimReview={choice,packet,evidence,support,disposition,handoff:null};
 const handoff=choice.retain?await writeClaimNote(report):null;
 return applicationResult(support,disposition,handoff);
}
