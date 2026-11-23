import {imageCandidateJournal} from "natlang:services";
import type {ImageJournal} from "./types.js";
/** Read one retained native image selection frontier. */
export default async function readImageJournal(channelId: string):Promise<ImageJournal | null>{
 return imageCandidateJournal.read(channelId);
}
