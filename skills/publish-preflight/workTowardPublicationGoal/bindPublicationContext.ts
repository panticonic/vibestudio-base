import {publicationGoal} from "natlang:services";
import type {PublicationGoalBinding,PublicationGoalChoice} from "../types.js";
/** Native binding preserves exact observed revision/target authority and honest unavailability. */
export default function bindPublicationContext(revision:string,choice:PublicationGoalChoice):Promise<PublicationGoalBinding|null>{return publicationGoal.bind(revision,choice);}
