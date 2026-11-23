import {interfaceReviewHandoff} from "natlang:services";
import type {InterfaceDecision, InterfaceHandoff, InterfaceObservation} from "./types.js";
/** Preserve one authorized local note about an exact inspected interface. */
export default async function stageReview(observation: InterfaceObservation, decision: InterfaceDecision):Promise<InterfaceHandoff | null>{
 return interfaceReviewHandoff.stage(observation, decision);
}
