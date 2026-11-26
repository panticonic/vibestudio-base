import readRecord from "../workspace/readAudienceRecord.js";
import type {AudienceRecord} from "../types.js";
/** Exact native record read; this inquiry does not gain rendering authority. */
export default async function readAudienceRecord():Promise<AudienceRecord>{return readRecord();}
