import {nativeIntentHandoff} from "natlang:services";
import type {IntentNote,IntentReport} from "./types.js";
export default async function stageIntentNote(report:IntentReport):Promise<IntentNote|null>{
 return nativeIntentHandoff.stage(report);
}
