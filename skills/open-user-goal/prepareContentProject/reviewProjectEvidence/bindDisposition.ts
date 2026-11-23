import type {ProjectEvidenceReview,ProjectEvidenceDecision,ProjectDispositionEvidence,ProjectDispositionChoice} from "../types.js";
export function dispositionEvidence(evidence:ProjectEvidenceReview):ProjectDispositionEvidence {
 let handle=0;
 return {title:evidence.title,audience:evidence.audience,documentRoles:evidence.documentRoles,occupied:evidence.occupied,
  records:evidence.records.map(record=>({edition:record.edition,purpose:record.purpose,localApproval:record.localApproval,facts:record.facts.map(fact=>({handle:handle++,text:fact.text}))}))};
}
export function bindDisposition(evidence:ProjectEvidenceReview,choice:ProjectDispositionChoice):ProjectEvidenceDecision {
 const references=evidence.records.flatMap(record=>record.facts.map(fact=>({source:record.id,digest:record.digest,fact:fact.id})));
 const selected=[...new Set(choice.selected)].map(handle=>{if(!Number.isSafeInteger(handle)||handle<0||handle>=references.length)throw new Error("Select a fact handle from the observed evidence");return references[handle]!;});
 return {...choice,selected};
}
