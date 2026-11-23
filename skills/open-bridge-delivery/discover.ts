import {branchDeliveryRead} from "natlang:services";
import type {BridgeIndex} from "./types.js";
/** List the current owned semantic project and archived transfer source that might share its name. */
export default async function discover():Promise<BridgeIndex>{
 return branchDeliveryRead.discover();
}
