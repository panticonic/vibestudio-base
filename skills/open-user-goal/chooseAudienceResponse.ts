import readAudienceRecord from "./chooseAudienceResponse/workspace/readAudienceRecord.js";
import renderAudienceVisual from "./chooseAudienceResponse/workspace/renderAudienceVisual.js";
import decideAudienceFormat from "./chooseAudienceResponse/decideAudienceFormat.nl";
import answerFromRecord from "./chooseAudienceResponse/answerFromRecord.nl";
import prepareAudienceVisual from "./chooseAudienceResponse/prepareAudienceVisual.nl";
import applicationResult from "./chooseAudienceResponse/applicationResult.js";
import type {AudienceResult} from "./chooseAudienceResponse/types.js";
export default async function chooseAudienceResponse(goal:string):Promise<AudienceResult>{
 const record=await readAudienceRecord();
 const choice=await decideAudienceFormat(goal,record);
 const answer=await answerFromRecord(goal,record,choice);
 const prepared=choice.mode==="plain"?null:await prepareAudienceVisual(goal,record,choice);
 const receipt=prepared?await renderAudienceVisual(record.id,record.revision,prepared):null;
 return applicationResult(answer,receipt);
}
