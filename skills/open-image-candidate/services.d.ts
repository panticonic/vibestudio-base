import type { ImageHandoff, ImageIndex, ImageJournal, ImageRead, ImageReport } from "./types.js";

declare module "natlang:services" {
  export const imageCandidateBriefs: { list(): Promise<ImageIndex> };
  export const imageCandidateJournal: { read(channelId:string): Promise<ImageJournal|null> };
  export const imageCandidateOriginal: { read(briefId:string,candidateId:string): Promise<ImageRead> };
  export const imageCandidateHandoff: { stage(report:ImageReport): Promise<ImageHandoff|null> };
}
