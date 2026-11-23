import {architectureProviderRead} from "natlang:services";
import type {ArchitectureRoute} from "../../types.js";
/** Resolve the assigned protocol using the current Vibestudio workspace registry. */
export default async function resolveProvider(operationId: string):Promise<ArchitectureRoute>{
 return architectureProviderRead.resolve(operationId);
}
