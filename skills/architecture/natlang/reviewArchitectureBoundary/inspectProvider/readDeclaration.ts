import {architectureProviderRead} from "natlang:services";
import type {ArchitectureDeclaration} from "../../types.js";
/** Read the resolved receiver's exact authored declaration at the observed source revision. */
export default async function readDeclaration(routeReceipt: string):Promise<ArchitectureDeclaration | null>{
 return architectureProviderRead.declaration(routeReceipt);
}
