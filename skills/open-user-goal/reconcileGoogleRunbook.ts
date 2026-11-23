import {googleRunbook} from "natlang:services";
import reviewCalendar from "./reconcileGoogleRunbook/reviewCalendar.nl";
import reconcileApproval from "./reconcileGoogleRunbook/reconcileApproval.nl";
import attributeBasis from "./reconcileGoogleRunbook/attributeBasis.nl";
import reviseRunbook from "./reconcileGoogleRunbook/reviseRunbook.nl";
import type {GoogleRunbookResult} from "./reconcileGoogleRunbook/types.js";
export default async function reconcileGoogleRunbook(goal:string):Promise<GoogleRunbookResult>{
 const local=await googleRunbook.read(),calendar=await reviewCalendar(goal,local);
 const decision=await reconcileApproval(goal,local,calendar),attribution=await attributeBasis(goal,local,calendar,decision);
 const write=decision.action==="revise"?await reviseRunbook(goal,local,calendar,decision):null;
 return {decision,write,attribution};
}
