import {localWidthHandoff} from "natlang:services";
import type {WidthFinding, WidthHandoff} from "./types.js";
/** Stage one authorized evidence-bound local readiness note. */
export default async function stageWidth(finding: WidthFinding):Promise<WidthHandoff | null>{
 return localWidthHandoff.stage(finding);
}
