import type {SmokeAssignment,SmokeSource,SmokeSelection} from "../types.js";
/** Exact native ownership coordinates are data matching, not a semantic inference. */
export default function selectSmokeContract(assignment:SmokeAssignment,source:SmokeSource):SmokeSelection {
 const candidates=source.plans.filter(plan=>plan.context===assignment.context&&plan.revision===assignment.revision&&plan.subject===assignment.subject);
 return source.truncated||!candidates.length?{plan:null,blocker:"hold-source"}:candidates.length!==1?{plan:null,blocker:"hold-ambiguity"}:{plan:candidates[0]!,blocker:null};
}
