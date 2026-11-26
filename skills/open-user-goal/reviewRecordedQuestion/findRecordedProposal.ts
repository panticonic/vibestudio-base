import searchNativeRationale from "./findRecordedProposal/searchNativeRationale.js";
import type {RecordedQuestion,RecordedCandidate} from "./types.js";
/** Preserve the actual scoped native search result; interpretation belongs to the natural coordinator. */
export default function findRecordedProposal(assignment:RecordedQuestion,phrase:string):Promise<RecordedCandidate[]>{return searchNativeRationale(assignment,phrase);}
