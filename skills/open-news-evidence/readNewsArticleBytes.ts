import {newsEvidenceSource} from "natlang:services";
import type {SourceReadback} from "./types.js";
/** Verify original content-addressed bytes for an exact same-reader article receipt. */
export default async function readNewsArticleBytes(channelId: string, message: string):Promise<SourceReadback | null>{
 return newsEvidenceSource.read(channelId, message);
}
