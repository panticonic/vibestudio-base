import {operationsDossier} from "natlang:services";
import type {OperationsDocket,OperationsDossier} from "./types.js";
import type {OperationsReport} from "./roles/types.js";
export default async function retainOperationsDossier(docket:OperationsDocket,operation:OperationsReport):Promise<OperationsDossier>{return operationsDossier.retain(docket.id,docket.revision,operation);}
