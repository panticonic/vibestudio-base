import type { ProvenanceReport } from "./attributeBasis/installed/types.js";
export type { ProvenanceReport };
import type { NewsEvidenceReport } from "../workOnNewsEvidenceGoal/workspace/types.js";
import type { PresentationReport } from "./designEditorPacket/installed/types.js";
import type { EditorDesk, EditorPacketPlan, EditorPacketReceipt } from "./contract.js";
export type { NewsEvidenceReport, PresentationReport };
export type { EditorDesk, EditorPacketPlan, EditorPacketReceipt } from "./contract.js";
export type NewsEditionReviewReport = { desk: EditorDesk; news: NewsEvidenceReport; plan: EditorPacketPlan; presentation: PresentationReport | null; artifact: EditorPacketReceipt | null; attribution: ProvenanceReport };
