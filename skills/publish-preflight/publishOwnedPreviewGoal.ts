import {ownedPreviewPublication} from "natlang:services";
import choosePreviewDestination from "./publishOwnedPreviewGoal/choosePreviewDestination.nl";
import preflightPublication from "./preflightPublication.nl";
import deliverPreview from "./publishOwnedPreviewGoal/deliverPreview.nl";
import type {OwnedPreviewReport} from "./types.js";
export default async function publishOwnedPreviewGoal(goal:string):Promise<OwnedPreviewReport>{
 const observation=await ownedPreviewPublication.discover(),target=await choosePreviewDestination(goal,observation);
 if(!target)return {status:"unresolved",reason:"The current launch record does not distinguish a requested destination."};
 const binding=await ownedPreviewPublication.bind(observation.revision,target);
 if(!binding)return {status:"unresolved",reason:"The destination is no longer bound to the observed launch revision."};
 if(binding.hold||!binding.preflight||!binding.operationId)return {status:"held",targetId:binding.targetId,reason:binding.hold??"The assigned preview operation is unavailable.",preflight:null,receipt:null,hosted:null};
 const preflight=await preflightPublication(binding.preflight);
 if(preflight.status!=="ready-for-review")return {status:"held",targetId:binding.targetId,reason:preflight.blockers[0]??"The publication preflight is not ready.",preflight,receipt:null,hosted:null};
 return deliverPreview(goal,binding.targetId,binding.operationId,preflight);
}
