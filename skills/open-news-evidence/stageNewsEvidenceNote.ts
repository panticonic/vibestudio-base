import {newsEvidenceHandoff} from "natlang:services";
import type {NewsEvidenceArtifact, NewsEvidenceReport} from "./types.js";
/** Stage a permitted private evidence note for the exact current News dossier. */
export default async function stageNewsEvidenceNote(report: NewsEvidenceReport):Promise<NewsEvidenceArtifact | null>{
 return newsEvidenceHandoff.stage(report);
}
