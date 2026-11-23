import findLocalInventoryDocket from "./compareLiveLocalInventory/findLocalInventoryDocket.nl";
import planLocalInventoryComparison from "./compareLiveLocalInventory/planLocalInventoryComparison.nl";
import prepareLocalModel from "./compareLiveLocalInventory/installed/prepareLocalModel.nl";
import type {LocalInventoryOutcome} from "./compareLiveLocalInventory/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function compareLiveLocalInventory(goal:string):Promise<LocalInventoryOutcome>{
 const docket=await findLocalInventoryDocket(goal);
 if(!docket)return {report:null,reason:"No unique current workload docket could be bound to this request."};
 const request=await planLocalInventoryComparison(goal,docket);
 const report=await prepareLocalModel(request);
 return {report,reason:`${report.ref}: ${report.disposition}${report.handoff?`; ${report.handoff.mode} conversation`:""}`};
}
