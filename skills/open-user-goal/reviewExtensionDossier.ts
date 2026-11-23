import reviewExtensionRelease from "./reviewExtensionDossier/extensiondev/reviewExtensionRelease.nl";
import discoverDossier from "./reviewExtensionDossier/discoverDossier.js";
import stageDossier from "./reviewExtensionDossier/stageDossier.js";
import compareCandidate from "./reviewExtensionDossier/compareCandidate.nl";
import inspectRelease from "./reviewExtensionDossier/inspectRelease.nl";
import decideDossier from "./reviewExtensionDossier/decideDossier.nl";
import type {ExtensionDossierOutcome} from "./reviewExtensionDossier/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewExtensionDossier(goal:string):Promise<ExtensionDossierOutcome>{
 const assignment=await discoverDossier();
 const review=await reviewExtensionRelease(assignment.request);
 const candidate=await compareCandidate(review);
 const history=await inspectRelease(assignment,review);
 const finding=await decideDossier(assignment,review,candidate,history);
 const dossier=finding.decision==="verify-local-candidate"||finding.decision==="record-current-comparison"||finding.decision==="record-retained-rollback"?await stageDossier(finding.decision):null;
 return {finding,dossier};
}
