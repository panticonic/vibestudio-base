import rehearseTour from "./reviewWelcomeTour/tour/rehearseTour.nl";
import type {TourWitness,TourScene,WelcomeRow} from "./types.js";
export default async function reviewWelcomeTour(goal:string,row:WelcomeRow,scene:TourScene,sceneCount:number):Promise<TourWitness>{
 if(row.record.kind!=="tour")throw new Error("A tour review requires an actual retained tour frame");
 const stop={topic:goal,scene,notes:row.record.expectedNotes},frame=row.record.frame;
 const result=await rehearseTour.reviewStops.verifyTourStop(stop,frame,sceneCount);
 return {stop,frame,sceneCount,result};
}
