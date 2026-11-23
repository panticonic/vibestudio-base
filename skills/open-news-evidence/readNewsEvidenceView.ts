import {newsEvidenceReader} from "natlang:services";
import type {ReaderEvidence, ReaderSelection} from "./types.js";
/** Obtain a canonical reader or archive observation for the joined owned reader. */
export default async function readNewsEvidenceView(channelId: string, selection: ReaderSelection):Promise<ReaderEvidence | null>{
 return newsEvidenceReader.read(channelId, selection);
}
