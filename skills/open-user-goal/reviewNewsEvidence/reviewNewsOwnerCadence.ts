import reviewSchedule from "./reviewNewsOwnerCadence/installed/reviewers/reviewSchedule.nl";
import type {NewsEvidenceIndex,NewsEvidenceSnapshot,ScheduleWitness,ScheduleEvidence} from "./types.js";
export default async function reviewNewsOwnerCadence(goal:string,index:NewsEvidenceIndex,current:NewsEvidenceSnapshot):Promise<ScheduleWitness>{
 const cadence=[...current.rows].reverse().find(row=>row.record.kind==="cadence")?.record;
 if(!cadence||cadence.kind!=="cadence")throw new Error("The current News owner cadence is unavailable");
 const input:ScheduleEvidence={kind:"schedule",goal,intent:index.scope.cadenceIntent,...cadence.current};
 return {input,result:await reviewSchedule(input)};
}
