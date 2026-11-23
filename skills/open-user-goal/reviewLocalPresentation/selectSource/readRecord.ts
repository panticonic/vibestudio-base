import {presentationRecords} from "natlang:services";
import type {LocalPresentationSource} from "../../types.js";
/** Read one discovered record's exact content and revision. */
export default async function readRecord(id: string):Promise<LocalPresentationSource>{
 return presentationRecords.read(id);
}
