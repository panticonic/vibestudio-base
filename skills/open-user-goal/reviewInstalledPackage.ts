import discoverPackage from "./reviewInstalledPackage/discoverPackage.js";
import inspectPackage from "./reviewInstalledPackage/inspectPackage.nl";
import decidePackage from "./reviewInstalledPackage/decidePackage.nl";
import restorePackage from "./reviewInstalledPackage/restorePackage.nl";
import reviewVerification from "./reviewInstalledPackage/reviewVerification.nl";
import type {InstalledPackageOutcome} from "./reviewInstalledPackage/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewInstalledPackage(goal:string):Promise<InstalledPackageOutcome>{
 const assignment=await discoverPackage();
 const observation=await inspectPackage(goal,assignment);
 const finding=await decidePackage(assignment,observation);
 const repair=finding.decision==="restore-approved-field"?await restorePackage(observation):null;
 const verification=await reviewVerification(repair?.observation??observation);
 return {finding,repair,verification};
}
