declare module "natlang:services" {
  export const imageCandidateBriefs: { list(): Promise<import("./types.js").ImageIndex> };
  export const imageCandidateJournal: { read(channelId:string): Promise<import("./types.js").ImageJournal|null> };
  export const imageCandidateOriginal: { read(briefId:string,candidateId:string): Promise<import("./types.js").ImageRead> };
  export const imageCandidateHandoff: { stage(report:import("./types.js").ImageReport): Promise<import("./types.js").ImageHandoff|null> };
}
