import {ownedOperations} from "natlang:services";
import selectOperationsDocket from "./coordinateOwnedOperations/selectOperationsDocket.nl";
import incident from "./coordinateOwnedOperations/roles/incident.nl";
import release from "./coordinateOwnedOperations/roles/release.nl";
import retainOperationsDossier from "./coordinateOwnedOperations/retainOperationsDossier.js";
import shouldRetainOperationsDossier from "./coordinateOwnedOperations/shouldRetainOperationsDossier.nl";
import type {OperationsGoalOutcome} from "./coordinateOwnedOperations/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function coordinateOwnedOperations(goal:string):Promise<OperationsGoalOutcome>{
 const selected=await selectOperationsDocket(goal);
 if(!selected)return {operation:null,dossier:null,disposition:"held",reason:"No unique current operational docket could be bound to this request."};
 if(selected.authority!=="local-exercise")return {operation:null,dossier:null,disposition:"held",reason:selected.rationale};
 const request=selected.request;
 const assessed=request.kind==="incident-handoff"?await incident(goal,request.signals):await release(goal,request.before,request.after);
 const cleanup=await ownedOperations.close();
 const operation={kind:request.kind,handoff:assessed.handoff,handles:assessed.handles,cleanup};
 const retain=request.kind==="release-continuation"&&assessed.handoff.decision==="ready"&&selected.retainWhenReady&&await shouldRetainOperationsDossier(goal);
 const dossier=retain?await retainOperationsDossier(selected.docket,operation):null;
 return {operation,dossier,disposition:"reviewed",reason:assessed.handoff.summary};
}
