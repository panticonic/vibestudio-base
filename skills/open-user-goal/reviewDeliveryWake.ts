import discoverDeliveryWake from "./reviewDeliveryWake/discoverDeliveryWake.js";
import inspectDeliveryWake from "./reviewDeliveryWake/inspectDeliveryWake.js";
import decideDeliveryWake from "./reviewDeliveryWake/decideDeliveryWake.nl";
import applyDeliveryWake from "./reviewDeliveryWake/applyDeliveryWake.js";
import type {DeliveryWakeReport} from "./reviewDeliveryWake/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewDeliveryWake(goal:string):Promise<DeliveryWakeReport>{
 const assignment=await discoverDeliveryWake();
 const evidence=await inspectDeliveryWake(assignment);
 const choice=await decideDeliveryWake(assignment,evidence);
 const receipt=choice.disposition==="advance"?await applyDeliveryWake(assignment,evidence,choice):null;
 return {choice,receipt};
}
