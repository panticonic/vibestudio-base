export type Format = "png" | "jpeg" | "webp";
export type Rights = "local-handoff" | "review-only" | "unknown" | "revoked";
export type ImageBrief = {
  id: string; project: string; title: string; intent: string; formats: Format[];
  reference: string | null; outputPurpose: string; owner: string;
};
export type Candidate = {
  kind: "candidate"; briefId: string; owner: string; label: string; jobId: string; attempt: number;
  state: "succeeded" | "cancelled" | "failed" | "running"; candidateId: string; assetId: string | null;
  assetDigest: string | null; providerReceipt: string | null; prompt: string; revisedPrompt: string;
  reference: string | null; format: Format; outputPath: string; save: "applied" | "preview-only" | "superseded";
};
export type JournalRecord = Candidate
  | {kind:"selection"; briefId:string; candidateId:string; owner:string}
  | {kind:"rights"; briefId:string; reference:string|null; rights:Rights; owner:string}
  | {kind:"preview"; briefId:string; candidateId:string; label:string; owner:string};
export type EvidenceRow = {id:string; seq:number; record:JournalRecord};
export type ImageJournal = { channelId:string; through:number; rows:EvidenceRow[] };
export type ImageIndex = { channelId:string; owner:string; briefs:ImageBrief[] };
export type ImagePlan = { briefId:string; mode:"current"|"compare"|"historical"; historicalLabel:string|null;
  localHandoff:boolean; acceptedFormats:Format[] };
export type CandidateAssessment = { id:string; reasons:string[]; eligible:boolean };
export type ImageAssessment = { queue:string[]; candidates:CandidateAssessment[] };
export type ImageRead = { candidateId:string; rowId:string|null; status:"verified"|"missing"|"mismatch"|"refused";
  original:{id:string;digest:string;mime:string;width:number;height:number;byteLength:number}|null };
export type ImageDecision = {action:"report"|"hold"|"stage"; candidateId:string|null; explanation:string};
export type ImageHandoff = {path:string; digest:string; candidateId:string; assetDigest:string; frontier:number};
export type ImageReport = {plan:ImagePlan; assessment:ImageAssessment; reads:ImageRead[]; decision:ImageDecision; handoff:ImageHandoff|null};
