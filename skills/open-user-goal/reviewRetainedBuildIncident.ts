import type {RetainedProfile,IncidentAssessment} from "./reviewRetainedBuildIncident/types.js";
import discoverIncident from "./reviewRetainedBuildIncident/discoverIncident.js";
import stageEvidence from "./reviewRetainedBuildIncident/stageEvidence.js";
import selectCheckpoints from "./reviewRetainedBuildIncident/selectCheckpoints.nl";
import decideFinding from "./reviewRetainedBuildIncident/decideFinding.nl";
import shouldRetainIncident from "./reviewRetainedBuildIncident/shouldRetainIncident.nl";
import reviewBuildPerformance from "./reviewRetainedBuildIncident/performance/reviewBuildPerformance.nl";
import type {BuildIncidentOutcome} from "./reviewRetainedBuildIncident/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewRetainedBuildIncident(goal:string):Promise<BuildIncidentOutcome>{
 const survey=await discoverIncident();
 const selected=await selectCheckpoints(goal,survey);
 async function assess(profile:RetainedProfile|null):Promise<IncidentAssessment|null>{
  if(!profile?.request)return null;
  const review=await reviewBuildPerformance(profile.request);
  return {checkpoint:profile.checkpoint,trace:profile.trace,diagnostic:profile.diagnostic,review};
 }
 const current=await assess(selected.current),baseline=await assess(selected.baseline);
 const disposition=await decideFinding(goal,selected.focus,current,baseline);
 const checkpoints=[current,baseline].filter((row):row is IncidentAssessment=>row!==null).map(row=>row.checkpoint.id);
 const handoff=survey.localHandoffAllowed&&disposition.finding!=="held"&&await shouldRetainIncident(goal)?await stageEvidence(checkpoints,selected.focus):null;
 return {current,baseline,disposition,handoff};
}
