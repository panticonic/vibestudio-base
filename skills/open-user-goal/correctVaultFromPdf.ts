import workOnPdfGoal from "./correctVaultFromPdf/pdf/workOnPdfGoal.js";
import authorizePdfVaultHandoff from "./authorizePdfVaultHandoff.nl";
import workTowardVaultGoal from "./correctVaultFromPdf/vault/workTowardVaultGoal.js";
import correctionResult from "./correctVaultFromPdf/correctionResult.js";
import type {PdfVaultCorrectionResult} from "./correctVaultFromPdf/types.js";
export default async function correctVaultFromPdf(goal:string):Promise<PdfVaultCorrectionResult>{
 const pdf=await workOnPdfGoal(goal),handoff=await authorizePdfVaultHandoff(goal,pdf);
 const vault=handoff.status==="bound"?await workTowardVaultGoal(handoff.directive):null;
 return correctionResult(handoff,vault);
}
