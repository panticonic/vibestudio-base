import {phoneSetupRead} from "natlang:services";
import type {DiscoveredPhones} from "../../types.js";
/** Discover phones on the prepared desktop. */
export default async function observePhones(prepareReceipt: string):Promise<DiscoveredPhones>{
 return phoneSetupRead.discover(prepareReceipt);
}
