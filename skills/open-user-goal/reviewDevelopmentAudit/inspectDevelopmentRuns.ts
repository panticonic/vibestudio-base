import {developmentAuditEvidence} from "natlang:services";
import type {DevelopmentAssignment,DevelopmentPair} from "./types.js";
export default async function inspectDevelopmentRuns(assignment:DevelopmentAssignment):Promise<DevelopmentPair>{
 const requested=await developmentAuditEvidence.read(assignment.requested);
 const alternate=await developmentAuditEvidence.read(assignment.alternate);
 return {requested,alternate};
}
