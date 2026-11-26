import {publicationGoal} from "natlang:services";
import type {PublicationGoalObservation} from "../types.js";
/** Exact current scope evidence; discovery does not grant publication effects. */
export default function discoverPublicationContext():Promise<PublicationGoalObservation>{return publicationGoal.discover();}
