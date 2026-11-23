import {newsEvidenceIndex} from "natlang:services";
import type {NewsEvidenceIndex} from "./types.js";
/** Discover the exact owned News reader, desk and retained topics. */
export default async function discoverOwnedNewsEvidence():Promise<NewsEvidenceIndex>{
 return newsEvidenceIndex.list();
}
