import selectSource from "./reviewLocalPresentation/selectSource.nl";
import preparePresentation from "./reviewLocalPresentation/visualize/preparePresentation.nl";
import previewRecord from "./reviewLocalPresentation/previewRecord.js";
import allowCurrentRecord from "./reviewLocalPresentation/allowCurrentRecord.nl";
import requestedFindings from "./reviewLocalPresentation/requestedFindings.nl";
import type {LocalPresentationOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewLocalPresentation(goal:string):Promise<LocalPresentationOutcome>{
 const selection=await selectSource(goal);
 if(selection.status==="held")return {status:"held",reason:selection.reason,revision:null};
 let record=selection.record;
 for(let attempt=0;attempt<2;attempt++){
  const report=await preparePresentation({goal,sections:record.sections});
  const preview=await previewRecord(record.id,record.revision,report);
  if(preview.status==="visible")return {status:"visible",receipt:preview.receipt,notes:await requestedFindings(goal,record)};
  if(preview.status==="unavailable")return {status:"held",reason:preview.reason,revision:record.revision};
  const current=await selectSource.readRecord(record.id);
  if(attempt===1||!await allowCurrentRecord(goal,record,current))return {status:"held",reason:"The selected source revision changed during preview.",revision:current.revision};
  record=current;
 }
 throw new Error("Presentation exhausted its bounded attempts");
}
