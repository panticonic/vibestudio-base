import type { NewsEvidenceArtifact, NewsEvidenceIndex, NewsEvidenceReport, NewsEvidenceSnapshot, ReaderEvidence, ReaderSelection, SourceReadback } from "./types.js";

declare module "natlang:services" {
  export const newsEvidenceIndex: { list(): Promise<NewsEvidenceIndex> };
  export const newsEvidenceJournal: { read(channelId:string): Promise<NewsEvidenceSnapshot|null> };
  export const newsEvidenceReader: { read(channelId:string,selection:ReaderSelection): Promise<ReaderEvidence|null> };
  export const newsEvidenceSource: { read(channelId:string,message:string): Promise<SourceReadback|null> };
  export const newsEvidenceHandoff: { stage(report:NewsEvidenceReport): Promise<NewsEvidenceArtifact|null> };
}
