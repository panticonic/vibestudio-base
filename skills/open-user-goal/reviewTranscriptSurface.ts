import discoverTranscriptSurface from "./reviewTranscriptSurface/discoverTranscriptSurface.js";
import reviewApprovals from "./reviewTranscriptSurface/reviewApprovals.nl";
import selectApprovedSurface from "./reviewTranscriptSurface/selectApprovedSurface.nl";
import inspectNativeSurface from "./reviewTranscriptSurface/inspectNativeSurface.nl";
import decideTranscriptEffect from "./reviewTranscriptSurface/decideTranscriptEffect.nl";
import materializeTranscriptEffect from "./reviewTranscriptSurface/materializeTranscriptEffect.nl";
import type {TranscriptSurfaceReport} from "./reviewTranscriptSurface/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewTranscriptSurface(goal:string):Promise<TranscriptSurfaceReport>{
 const assignment=await discoverTranscriptSurface();
 const approvals=await reviewApprovals(assignment);
 const selection=await selectApprovedSurface(assignment,approvals);
 const replay=selection.approval?await inspectNativeSurface(assignment,selection.approval):null;
 const decision=await decideTranscriptEffect(assignment,selection,replay);
 let receipt=null;
 if(decision.effect!=="none"){
  if(!selection.approval||!replay)throw new Error("Transcript effect requires an actual approved surface and replay");
  receipt=await materializeTranscriptEffect(assignment,selection.approval,replay,decision);
 }
 return {decision,receipt};
}
