import listPacketMissions from "./workOnEditorialPacket/packet/listPacketMissions.js";
import readPacketSnapshot from "./workOnEditorialPacket/packet/readPacketSnapshot.js";
import applyPacketRevision from "./workOnEditorialPacket/packet/applyPacketRevision.js";
import readStoredPacket from "./workOnEditorialPacket/packet/readStoredPacket.js";
import writePacketHandoff from "./workOnEditorialPacket/packet/writePacketHandoff.js";
import chooseEditorialMission from "./workOnEditorialPacket/chooseEditorialMission.nl";
import reviewPacketSource from "./workOnEditorialPacket/reviewPacketSource.nl";
import proposeEditorialRevision from "./workOnEditorialPacket/proposeEditorialRevision.nl";
import reconcileEditorialRevision from "./workOnEditorialPacket/reconcileEditorialRevision.nl";
import decideEditorialHandoff from "./workOnEditorialPacket/decideEditorialHandoff.nl";
import result from "./workOnEditorialPacket/result.js";
import type {EditorialPacketResult,PacketReport,PacketWrite,PacketEdit} from "./workOnEditorialPacket/types.js";
export default async function workOnEditorialPacket(goal:string):Promise<EditorialPacketResult>{
 const plan=await chooseEditorialMission(goal,await listPacketMissions()),opening=await readPacketSnapshot(plan.missionId);
 if(!opening)throw new Error("The chosen owned editorial mission is unavailable");
 let current=opening,revised:string|null=null;
 const source=await reviewPacketSource(goal,opening,plan),sources=[source],attempts:PacketWrite[]=[];
 const proposed=plan.operation==="revise"&&source.evidence?.status==="grounded"?await proposeEditorialRevision(goal,opening,source):null;
 if(proposed&&proposed.text!==opening.candidate.text){
  const first=await applyPacketRevision(plan.missionId,proposed);attempts.push(first);
  if(first.status==="changed"){
   const latest=await readPacketSnapshot(plan.missionId);
   if(!latest)throw new Error("The owned editorial mission disappeared during reconciliation");
   current=latest;
   const refreshed=await reviewPacketSource(goal,current,plan);sources.push(refreshed);
   revised=await reconcileEditorialRevision(goal,opening,current,proposed,source,refreshed);
   if(revised!==null&&revised!==current.candidate.text)attempts.push(await applyPacketRevision(plan.missionId,{...current.candidate,text:revised}));
  }
 }
 const stored=await readStoredPacket(plan.missionId);
 if(!stored)throw new Error("The owned editorial candidate readback is unavailable");
 const edit:PacketEdit={proposed,revised,attempts,stored};
 const decision=await decideEditorialHandoff(goal,plan,opening,current,sources,edit);
 const report:PacketReport={plan,opening,current,sources,edit,decision,note:null};
 const note=decision.write?await writePacketHandoff(report):null;
 return result(stored,decision,note);
}
