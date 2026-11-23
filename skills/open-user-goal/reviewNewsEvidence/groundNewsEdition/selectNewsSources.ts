import type {NewsEvidenceIndex,NewsEvidenceSnapshot,NewsEvidenceRow} from "../types.js";
export default function selectNewsSources(topic:string,index:NewsEvidenceIndex,current:NewsEvidenceSnapshot):NewsEvidenceRow[]{return current.rows.filter(({record})=>record.kind==="article"&&record.topic===topic&&record.contextId===index.scope.contextId&&record.reader===index.scope.reader);}
