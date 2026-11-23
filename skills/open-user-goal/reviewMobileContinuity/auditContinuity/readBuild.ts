import {mobileContinuity} from "natlang:services";
import type {MobileBuildEvidence} from "../../types.js";
/** Read exact fixture-scoped mobile build evidence. */
export default async function readBuild(id: string):Promise<MobileBuildEvidence>{
 return mobileContinuity.build(id);
}
