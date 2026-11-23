import type { OpenVaultReport } from "./vault/types.js";
import type { PdfVaultHandoff } from "../types.js";
export type PdfVaultCorrectionResult = {source:Extract<PdfVaultHandoff,{status:"bound"}>["source"]|null;holdReason:string|null;vault:OpenVaultReport|null};
