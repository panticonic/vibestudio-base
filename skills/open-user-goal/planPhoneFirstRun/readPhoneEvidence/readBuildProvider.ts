import {phoneFirstRun} from "natlang:services";
import type {PhoneProviderEvidence} from "../../types.js";
/** Read the actual installed React Native System source declaration. */
export default async function readBuildProvider(id: string):Promise<PhoneProviderEvidence>{
 return phoneFirstRun.provider(id);
}
