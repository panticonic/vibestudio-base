import {integrationCredentialLookup} from "natlang:services";
import type {IntegrationObservation} from "../../types.js";
/** Ask the host's resolver for the assigned destination and transport. */
export default async function resolveBinding(planReceipt: string, destinationId: string):Promise<IntegrationObservation>{
 return integrationCredentialLookup.resolve(planReceipt, destinationId);
}
