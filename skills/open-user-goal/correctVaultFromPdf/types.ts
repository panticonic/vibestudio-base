import type { OpenVaultReport } from "./vault/types.js";
export type PdfVaultCorrectionResult = {source:{document:string;digest:string;citations:{page:number;line:number;quote:string}[]}|null;holdReason:string|null;vault:OpenVaultReport|null};
