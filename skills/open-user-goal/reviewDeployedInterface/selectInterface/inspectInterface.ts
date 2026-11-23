import {interfaceEvidence} from "natlang:services";
import type {InterfaceObservation} from "../types.js";
/** Read the exact current working declaration and independently supported deployed definition. */
export default async function inspectInterface(id: string):Promise<InterfaceObservation>{
 return interfaceEvidence.inspect(id);
}
