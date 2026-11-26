import type {ContentArchiveFindings,ContentArchiveWorkingFile} from "./types.js";
export default function applicationResult(explanation:string,files:ContentArchiveWorkingFile[]):ContentArchiveFindings{return {explanation,files};}
