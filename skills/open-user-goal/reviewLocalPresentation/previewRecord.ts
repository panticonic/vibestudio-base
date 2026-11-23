import {presentationRecords} from "natlang:services";
import type {PreviewDisposition} from "../types.js";
/** Verify one authorized local preview against an observed source revision and the live renderer. */
export default async function previewRecord(id: string, revision: string, report: unknown):Promise<PreviewDisposition>{
 return presentationRecords.preview(id, revision, report);
}
