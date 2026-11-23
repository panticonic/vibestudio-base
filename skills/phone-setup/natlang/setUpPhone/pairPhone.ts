import {phoneSetupPair} from "natlang:services";
import type {PhonePairing} from "../types.js";
/** Provision the exact ready attached phone from the current discovery. */
export default async function pairPhone(discoveryReceipt: string, deviceId: string):Promise<PhonePairing>{
 return phoneSetupPair.provision(discoveryReceipt, deviceId);
}
