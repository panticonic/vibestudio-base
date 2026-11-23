import type {PdfVaultCorrectionResult} from "./types.js";
import type {PdfVaultHandoff} from "../types.js";
import type {OpenVaultReport} from "./vault/types.js";
export default function correctionResult(handoff:PdfVaultHandoff,vault:OpenVaultReport|null):PdfVaultCorrectionResult {
 return {source:handoff.status==="bound"?handoff.source:null,holdReason:handoff.status==="hold"?handoff.reason:null,vault};
}
