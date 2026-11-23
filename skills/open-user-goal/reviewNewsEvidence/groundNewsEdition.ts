import selectNewsSources from "./groundNewsEdition/selectNewsSources.js";
import readNewsArticleBytes from "./groundNewsEdition/workspace/readNewsArticleBytes.js";
import reviewNewsDevelopments from "./groundNewsEdition/reviewNewsDevelopments.nl";
import type {NewsEvidenceIndex,NewsEvidenceSnapshot,BriefingWitness,SourceReadback} from "./types.js";
export default async function groundNewsEdition(goal:string,index:NewsEvidenceIndex,topic:string,current:NewsEvidenceSnapshot):Promise<{briefing:BriefingWitness|null;sources:SourceReadback[]}>{
 const edition=[...current.rows].reverse().find(row=>row.record.kind==="edition"&&row.record.topic===topic)?.record;
 if(!edition||edition.kind!=="edition")return {briefing:null,sources:[]};
 const selected=selectNewsSources(topic,index,current),sources:SourceReadback[]=[];
 for(const row of selected){const source=await readNewsArticleBytes(index.scope.channelId,row.messageId);if(source)sources.push(source);}
 return {briefing:await reviewNewsDevelopments(goal,index,edition,selected,sources),sources};
}
