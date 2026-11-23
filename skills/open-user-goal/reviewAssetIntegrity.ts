import discoverVersions from "./reviewAssetIntegrity/discoverVersions.js";
import readVersion from "./reviewAssetIntegrity/readVersion.nl";
import compareAsset from "./reviewAssetIntegrity/compareAsset.nl";
import planRecovery from "./reviewAssetIntegrity/planRecovery.nl";
import stageRecovery from "./reviewAssetIntegrity/stageRecovery.js";
import allowRefreshedRevision from "./reviewAssetIntegrity/allowRefreshedRevision.nl";
import type {AssetIntegrityOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewAssetIntegrity(goal:string):Promise<AssetIntegrityOutcome>{
 let versions=await Promise.all((await discoverVersions()).map(version=>readVersion(version)));
 for(let attempt=0;attempt<2;attempt++){
  const approved=versions.find(row=>row.version.edition==="approved");
  const working=versions.find(row=>row.version.edition==="working");
  if(!approved||!working)throw new Error("Approved and working asset editions must both be observed");
  const findings=[];
  for(const claim of approved.manifest.assets)findings.push(await compareAsset(claim,approved,working));
  const plan=await planRecovery(goal,versions,findings);
  if(plan.status!=="copy")return {status:plan.status,approved:approved.version.id,working:working.version.id,findings,receipt:null,reason:plan.reason};
  const result=await stageRecovery(approved.version.id,working.version.id,plan.selection);
  if(result.status==="staged")return {status:"staged",approved:approved.version.id,working:working.version.id,findings,receipt:result.receipt,reason:"Approved originals retained in private scratch."};
  if(result.status==="held")return {status:"held",approved:approved.version.id,working:working.version.id,findings,receipt:null,reason:result.reason};
  versions=await Promise.all((await discoverVersions()).map(version=>readVersion(version)));
  const refreshed=versions.find(row=>row.version.edition==="working");
  if(attempt===1||!await allowRefreshedRevision(goal))return {status:"held",approved:approved.version.id,working:refreshed?.version.id??result.working,findings,receipt:null,reason:"The working revision changed during recovery."};
 }
 throw new Error("Asset recovery exhausted its bounded attempts");
}
