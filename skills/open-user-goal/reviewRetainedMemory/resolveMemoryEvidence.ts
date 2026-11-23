import recallMemoryLeads from "./evidence/recallMemoryLeads.js";
import readMemoryMessages from "./evidence/readMemoryMessages.js";
import readMemoryArchive from "./evidence/readMemoryArchive.js";
import readMemoryDraft from "./evidence/readMemoryDraft.js";
import type {MemoryBrief,MemoryPlan,MemoryEvidence,MemoryFile} from "./types.js";
export default async function resolveMemoryEvidence(brief:MemoryBrief,plan:MemoryPlan):Promise<MemoryEvidence>{
 const leads=await recallMemoryLeads(plan.query,plan.kinds);
 const messages=plan.readTranscript?await readMemoryMessages(brief.channelId):[];
 const seen=new Set<string>(),committed:MemoryFile[]=[];
 for(const lead of leads){
  if(lead.kind==="message"||seen.has(lead.eventId))continue;
  seen.add(lead.eventId);
  const file=await readMemoryArchive(lead.eventId);if(file)committed.push(file);
 }
 const working=plan.readWorking?await readMemoryDraft():null;
 return {leads,messages,committed,working};
}
