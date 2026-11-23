import {localWidthEvidence} from "natlang:services";
import type {WidthSurvey} from "./types.js";
/** Read the current local machine, task constraint, provider and retained witness directory. */
export default async function discoverWidth():Promise<WidthSurvey>{
 return localWidthEvidence.discover();
}
