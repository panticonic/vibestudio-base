declare module "natlang:services" {
  export const newsEvidenceIndex: { list(): Promise<import("./types.js").NewsEvidenceIndex> };
  export const newsEvidenceJournal: { read(channelId:string): Promise<import("./types.js").NewsEvidenceSnapshot|null> };
  export const newsEvidenceReader: { read(channelId:string,selection:import("./types.js").ReaderSelection): Promise<import("./types.js").ReaderEvidence|null> };
  export const newsEvidenceSource: { read(channelId:string,message:string): Promise<import("./types.js").SourceReadback|null> };
  export const newsEvidenceHandoff: { stage(report:import("./types.js").NewsEvidenceReport): Promise<import("./types.js").NewsEvidenceArtifact|null> };
}
