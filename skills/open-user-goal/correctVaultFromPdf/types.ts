import type { PdfGoalReport } from "./pdf/types.js";
import type { OpenVaultReport } from "./vault/types.js";
import type { PdfVaultHandoff } from "../types.js";
export type PdfVaultCorrection = { pdf: PdfGoalReport; handoff: PdfVaultHandoff; vault: OpenVaultReport | null };
