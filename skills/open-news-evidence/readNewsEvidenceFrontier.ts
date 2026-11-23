import {newsEvidenceJournal} from "natlang:services";
import type {NewsEvidenceSnapshot} from "./types.js";
/** Read one exact owned News evidence frontier. */
export default async function readNewsEvidenceFrontier(channelId: string):Promise<NewsEvidenceSnapshot | null>{
 return newsEvidenceJournal.read(channelId);
}
