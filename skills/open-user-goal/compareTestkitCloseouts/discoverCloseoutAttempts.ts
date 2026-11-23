import {testkitCloseout} from "natlang:services";
import type {CloseoutPair} from "./types.js";
/** Retrieve only the two exact attempts for this owned closeout comparison. */
export default async function discoverCloseoutAttempts(goal: string):Promise<CloseoutPair>{
 return testkitCloseout.nominate(goal);
}
