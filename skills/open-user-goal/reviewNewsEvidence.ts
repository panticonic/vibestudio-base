import discoverOwnedNewsEvidence from "./reviewNewsEvidence/workspace/discoverOwnedNewsEvidence.js";
import readNewsEvidenceFrontier from "./reviewNewsEvidence/workspace/readNewsEvidenceFrontier.js";
import readNewsEvidenceView from "./reviewNewsEvidence/workspace/readNewsEvidenceView.js";
import stageNewsEvidenceNote from "./reviewNewsEvidence/workspace/stageNewsEvidenceNote.js";
import chooseNewsCoverage from "./reviewNewsEvidence/chooseNewsCoverage.nl";
import checkNewsReaderBoundary from "./reviewNewsEvidence/checkNewsReaderBoundary.js";
import reviewNewsOwnerCadence from "./reviewNewsEvidence/reviewNewsOwnerCadence.js";
import reviewNewsReaderWindow from "./reviewNewsEvidence/reviewNewsReaderWindow.js";
import groundNewsEdition from "./reviewNewsEvidence/groundNewsEdition.js";
import decideNewsEvidenceHandoff from "./reviewNewsEvidence/decideNewsEvidenceHandoff.nl";
import type {NewsEvidenceReport,ReaderWitness,BriefingWitness,SourceReadback} from "./reviewNewsEvidence/types.js";
export default async function reviewNewsEvidence(goal:string):Promise<NewsEvidenceReport>{
 const index=await discoverOwnedNewsEvidence(),choice=await chooseNewsCoverage(goal,index);
 const earlier=await readNewsEvidenceFrontier(index.scope.channelId),current=await readNewsEvidenceFrontier(index.scope.channelId);
 if(!earlier||!current)throw new Error("The owned News evidence frontier is unavailable");
 const boundary=checkNewsReaderBoundary(index,earlier,current),schedule=await reviewNewsOwnerCadence(goal,index,current);
 const readers:ReaderWitness[]=[];let briefing:BriefingWitness|null=null,sources:SourceReadback[]=[];
 if(boundary.reason==="verified-reader"){
  for(const selection of choice.views){const input=await readNewsEvidenceView(index.scope.channelId,selection);if(input)readers.push(await reviewNewsReaderWindow(selection,input));}
  ({briefing,sources}=await groundNewsEdition(goal,index,choice.topic,current));
 }
 const plan=await decideNewsEvidenceHandoff(goal,index,choice,current,boundary,readers,schedule,briefing);
 const report:NewsEvidenceReport={plan,readers,schedule,briefing,sources,handoff:null};
 const handoff=plan.action==="stage"?await stageNewsEvidenceNote(report):null;
 return {...report,handoff};
}
