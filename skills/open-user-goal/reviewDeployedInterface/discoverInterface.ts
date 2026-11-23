import {interfaceEvidence} from "natlang:services";
import type {InterfaceSurvey} from "./types.js";
/** Discover assigned installed units and their exact retained proposal scope. */
export default async function discoverInterface():Promise<InterfaceSurvey>{
 return interfaceEvidence.discover();
}
