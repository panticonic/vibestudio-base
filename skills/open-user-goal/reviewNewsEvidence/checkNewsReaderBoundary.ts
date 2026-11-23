import type {NewsEvidenceIndex,NewsEvidenceSnapshot,ReaderBoundary,ReaderState} from "./types.js";
export default function checkNewsReaderBoundary(index:NewsEvidenceIndex,earlier:NewsEvidenceSnapshot,current:NewsEvidenceSnapshot):ReaderBoundary{
 const row=[...current.rows].reverse().find(row=>row.record.kind==="reader-state");
 const message=row?.messageId??null,state=row?.record as ReaderState|undefined,scope=index.scope;
 if(scope.requestedReader!==scope.reader||state&&(state.reader!==scope.reader||state.contextId!==scope.contextId))return {message,reason:"foreign-reader"};
 if(!state)return {message,reason:"reader-unobserved"};
 if(state.generation!==scope.generation)return {message,reason:"stale-reader"};
 return {message,reason:state.allowed?"verified-reader":"reader-revoked"};
}
