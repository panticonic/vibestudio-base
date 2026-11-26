import {ownedOperations} from "natlang:services";
import type {OperationsWorkflowKind,OperationsHandoff,OperationsOwnedHandle,OperationsReport} from "./roles/types.js";
/** Exact owned lifetime boundary; the caller supplies the actual semantic role result. */
export default async function completeOperation(kind:OperationsWorkflowKind,assessed:{handoff:OperationsHandoff;handles:OperationsOwnedHandle[]}):Promise<OperationsReport>{
 const cleanup=await ownedOperations.close();
 return {kind,handoff:assessed.handoff,handles:assessed.handles,cleanup};
}
