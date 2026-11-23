import {nativeIntentHandoff} from "natlang:services";
import type {IntentNote,IntentOutcome} from "./types.js";
/** Retain the conclusion against native observations already owned by this operation. */
export default async function stageIntentNote(outcome:IntentOutcome):Promise<IntentNote|null>{
 return nativeIntentHandoff.stage(outcome);
}
