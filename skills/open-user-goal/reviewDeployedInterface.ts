import discoverInterface from "./reviewDeployedInterface/discoverInterface.js";
import selectInterface from "./reviewDeployedInterface/selectInterface.nl";
import decideReview from "./reviewDeployedInterface/decideReview.nl";
import shouldRetainReview from "./reviewDeployedInterface/shouldRetainReview.nl";
import reviewArchitectureBoundary from "./reviewDeployedInterface/architecture/reviewArchitectureBoundary.nl";
import stageReview from "./reviewDeployedInterface/stageReview.js";
import type {DeployedInterfaceOutcome} from "./reviewDeployedInterface/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewDeployedInterface(goal:string):Promise<DeployedInterfaceOutcome>{
 const survey=await discoverInterface();
 const observation=await selectInterface(goal,survey);
 const architecture=observation.architecture?await reviewArchitectureBoundary(observation.architecture):null;
 const finding=await decideReview(survey,observation,architecture);
 const handoff=(finding.decision==="reviewable"||finding.decision==="deployed-method-confirmed")&&await shouldRetainReview(goal)?await stageReview(observation,finding.decision):null;
 return {finding,handoff};
}
