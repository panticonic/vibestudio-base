import discoverArchive from "./recoverContentArchive/discoverArchive.js";
import applyArchive from "./recoverContentArchive/applyArchive.js";
import inspectArchive from "./recoverContentArchive/inspectArchive.nl";
import chooseEdition from "./recoverContentArchive/chooseEdition.nl";
import planRestoration from "./recoverContentArchive/planRestoration.nl";
import type {ContentArchiveOutcome} from "./recoverContentArchive/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function recoverContentArchive(goal:string):Promise<ContentArchiveOutcome>{
 const assignment=await discoverArchive();
 const observation=await inspectArchive(assignment);
 const archive=await chooseEdition(assignment,observation);
 const plan=await planRestoration(assignment,observation,archive);
 const receipt=plan.action==="restore"?await applyArchive(assignment,observation,archive,plan):null;
 return {action:plan.action,reason:plan.reason,receipt};
}
