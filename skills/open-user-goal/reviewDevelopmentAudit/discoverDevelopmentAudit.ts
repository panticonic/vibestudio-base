import {developmentAuditEvidence} from "natlang:services";
import type {DevelopmentAssignment} from "./types.js";
/** Review owned retained development evidence. */
export default async function discoverDevelopmentAudit():Promise<DevelopmentAssignment>{
 return developmentAuditEvidence.discover();
}
