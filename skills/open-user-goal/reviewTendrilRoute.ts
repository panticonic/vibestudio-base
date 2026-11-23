import identifyTendril from "./reviewTendrilRoute/identifyTendril.nl";
import reviewSlot from "./reviewTendrilRoute/reviewSlot.nl";
import allowCurrentBoard from "./reviewTendrilRoute/allowCurrentBoard.nl";
import assessRoute from "./reviewTendrilRoute/assessRoute.nl";
import retainRoute from "./reviewTendrilRoute/retainRoute.js";
import type {TendrilRouteOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewTendrilRoute(goal:string):Promise<TendrilRouteOutcome>{
 const choice=await identifyTendril(goal);
 if(choice.status==="held")return {status:"held",reason:choice.reason,finding:null,receipt:null};
 let board=choice.board;
 let slot=await reviewSlot(goal,board);
 if(slot.status==="changed"){
  const current=await identifyTendril.readBoard(board.id);
  if(!await allowCurrentBoard(goal,board,current))return {status:"held",reason:"The board revision changed outside the requested scope.",finding:null,receipt:null};
  board=current;slot=await reviewSlot(goal,board);
 }
 if(slot.status!=="projected")return {status:"held",reason:slot.status==="held"?slot.reason:"The board changed again during route inspection.",finding:null,receipt:null};
 const decision=await assessRoute(goal,board,slot.finding);
 const receipt=decision.verified&&decision.retain&&board.retainAllowed?await retainRoute(slot.finding):null;
 return {status:decision.verified&&(!decision.retain||receipt!==null)?"verified":"held",finding:slot.finding,receipt,reason:decision.retain&&decision.verified&&!receipt?"The route changed before its private record could be retained.":decision.reason};
}
