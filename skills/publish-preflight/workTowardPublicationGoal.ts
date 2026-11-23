import {publicationGoal} from "natlang:services";
import choosePublicationScope from "./workTowardPublicationGoal/choosePublicationScope.nl";
import reviewPublicationRevision from "./reviewPublicationRevision.nl";
import preflightPublication from "./preflightPublication.nl";
import type {PublicationGoalReport} from "./types.js";
export default async function workTowardPublicationGoal(goal:string):Promise<PublicationGoalReport>{
 let observed=await publicationGoal.discover(),choice=await choosePublicationScope(goal,observed);
 if(!choice)return {status:"blocked",reason:"The current publication evidence does not establish the requested scope."};
 let bound=await publicationGoal.bind(observed.revision,choice);
 if(!bound){observed=await publicationGoal.discover();choice=await choosePublicationScope(goal,observed);if(choice)bound=await publicationGoal.bind(observed.revision,choice);}
 if(!choice||!bound)return {status:"blocked",reason:"The selected publication scope could not be bound to current evidence."};
 const revision=bound.revision?await reviewPublicationRevision(bound.revision):null;
 const preflight=bound.preflight?await preflightPublication(bound.preflight):null;
 return {status:"reviewed",choice,preflight,revision};
}
