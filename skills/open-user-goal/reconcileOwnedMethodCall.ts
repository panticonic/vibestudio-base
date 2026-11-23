import readMethodLane from "./reconcileOwnedMethodCall/readMethodLane.nl";
import planMethodExchange from "./reconcileOwnedMethodCall/planMethodExchange.nl";
import dispatchOwnedLocalMethod from "./reconcileOwnedMethodCall/dispatchOwnedLocalMethod.js";
import readExactMethodTerminal from "./reconcileOwnedMethodCall/readExactMethodTerminal.js";
import finishMethodExchange from "./reconcileOwnedMethodCall/finishMethodExchange.js";
import type {LocalMethodOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reconcileOwnedMethodCall(goal:string):Promise<LocalMethodOutcome>{
 const {card,evidence}=await readMethodLane(goal);
 const plan=await planMethodExchange(goal,card,evidence);
 const attempt=plan.action==="request"?await dispatchOwnedLocalMethod(card.id,evidence.basis,plan.method):null;
 const transport=attempt?.transport??(plan.action==="recover"?evidence.retained?.transport??null:null);
 const terminal=await readExactMethodTerminal(card.id,evidence.basis,transport);
 return finishMethodExchange(plan,terminal);
}
