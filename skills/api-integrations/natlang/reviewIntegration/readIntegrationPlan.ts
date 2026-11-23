import {integrationPlanRead} from "natlang:services";
import type {IntegrationPlan} from "../types.js";
/** Read the caller's assigned destinations and intended transports. */
export default async function readIntegrationPlan(operationId: string):Promise<IntegrationPlan>{
 return integrationPlanRead.observe(operationId);
}
