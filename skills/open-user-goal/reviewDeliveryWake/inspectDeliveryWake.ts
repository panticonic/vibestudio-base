import readNativeWake from "./inspectDeliveryWake/readNativeWake.js";
import type {DeliveryWakeAssignment,DeliveryWakeEvidence} from "./types.js";
export default async function inspectDeliveryWake(assignment:DeliveryWakeAssignment):Promise<DeliveryWakeEvidence>{return readNativeWake(assignment);}
