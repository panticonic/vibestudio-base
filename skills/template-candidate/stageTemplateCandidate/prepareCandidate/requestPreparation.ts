import {templateCandidatePrepare} from "natlang:services";
import type {StageReceipt} from "../../types.js";
/** Stage the caller's exact cached upstream pin through the Templates service. */
export default async function requestPreparation():Promise<StageReceipt>{
 return templateCandidatePrepare.prepare();
}
