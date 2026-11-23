import discoverSourceAttribution from "./reviewSourceAttribution/discoverSourceAttribution.js";
import selectCandidates from "./reviewSourceAttribution/selectCandidates.nl";
import inspectCurrentSource from "./reviewSourceAttribution/inspectCurrentSource.nl";
import selectFragments from "./reviewSourceAttribution/selectFragments.nl";
import traceSelectedSource from "./reviewSourceAttribution/traceSelectedSource.nl";
import explainSourceOrigin from "./reviewSourceAttribution/explainSourceOrigin.nl";
import reviewAttributionHandoff from "./reviewSourceAttribution/reviewAttributionHandoff.nl";
import type {SourceAttributionReport} from "./reviewSourceAttribution/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewSourceAttribution(goal:string):Promise<SourceAttributionReport>{
 const assignment=await discoverSourceAttribution();
 const ids=await selectCandidates(assignment),files=[];
 for(const id of ids){
  if(!assignment.candidates.some(candidate=>candidate.id===id))throw new Error("Source selection is outside the assigned candidates");
  const file=await inspectCurrentSource(assignment,id);if(file)files.push(file);
 }
 const selected=await selectFragments(assignment,files),evidence=[];
 for(const selection of selected){
  const file=files.find(file=>file.candidate.id===selection.candidate);
  if(!file||!file.fragments.some(fragment=>fragment.id===selection.fragment))throw new Error("Source fragment must belong to an actual inspected file");
  evidence.push(await traceSelectedSource(assignment,file,selection));
 }
 const conclusion=await explainSourceOrigin(goal,files,evidence);
 const receipt=assignment.mayRetain?await reviewAttributionHandoff(assignment,files,evidence,conclusion):null;
 return {conclusion,receipt};
}
