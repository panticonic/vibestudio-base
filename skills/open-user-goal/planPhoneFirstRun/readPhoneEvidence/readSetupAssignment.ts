import {phoneFirstRun} from "natlang:services";
import type {PhoneFirstRunAssignment} from "../../types.js";
/** Read retained pairing ownership and declared desktop eligibility. */
export default async function readSetupAssignment(id: string):Promise<PhoneFirstRunAssignment>{
 return phoneFirstRun.inspect(id);
}
