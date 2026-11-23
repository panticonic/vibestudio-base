import {templateAuthoringRead} from "natlang:services";
import type {TemplateAuthoringPlan} from "../types.js";
/** Read the native authoring receipt for one assigned template intent. */
export default async function readAuthoringPlan(operationId: string):Promise<TemplateAuthoringPlan>{
 return templateAuthoringRead.inspect(operationId);
}
