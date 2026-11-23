import {buildIncidentCatalog} from "natlang:services";
import type {IncidentSurvey} from "./types.js";
/** Read the current owned build subject and retained checkpoint directory. */
export default async function discoverIncident():Promise<IncidentSurvey>{
 return buildIncidentCatalog.discover();
}
