export type AudienceMode = "plain" | "catalog" | "calculator";
export type AudienceFact = { id: string; value: string };
export type AudienceSection = { id: string; required: boolean; ask: string; data: string };
export type AudienceModel = {
  id: string; title: string; inputLabel: string; outputLabel: string;
  baseCents: number; unitCents: number; divisor: number; initial: number; min: number; max: number;
};
export type AudienceRecord = {
  id: string; revision: string; title: string; source: string; facts: AudienceFact[];
  sections: AudienceSection[]; model: AudienceModel | null;
};
export type AudienceChoice = { mode: AudienceMode; reason: string };
export type AudienceAnswer = { facts: AudienceFact[]; text: string };
export type AudiencePrepared = { presentation: unknown; modelId: string | null };
export type AudienceInteraction = {
  inputLabel: string; beforeInput: number; afterInput: number; beforeResult: string; afterResult: string;
};
export type AudienceReceipt = {
  revision: string; ids: string[]; mdxDigests: string[]; interaction: AudienceInteraction | null;
};
export type AudienceReport = {
  record: AudienceRecord; choice: AudienceChoice; answer: AudienceAnswer;
  prepared: AudiencePrepared | null; receipt: AudienceReceipt | null;
};
