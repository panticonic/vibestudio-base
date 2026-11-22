export type LaunchTrigger =
  | {kind:"manual"}
  | {kind:"schedule";everyMs:number;anchorAt?:number;untilAt?:number;maxRuns?:number}
  | {kind:"cron";expression:string;timezone:string;untilAt?:number;maxRuns?:number};
export type LaunchOperation = {service:string;method:string;use:"action"|"conditional"};
export type LaunchPlannerInput = {
  goal:string;timezone:string;now:string;
  visible:{id:string;name:string;state:"active"|"paused"|"retired";latestRun:null}[];
  availableOperations:LaunchOperation[];
};
export type LaunchPlan = {
  kind:"launch";executor:"notify"|"prompt"|"tool"|"watch"|"eval"|"method";trigger:LaunchTrigger;
  conversation:"continue"|"fresh";operations:LaunchOperation[];
}|{kind:"hold";reason:string};
export type LaunchConsent = {
  id:string;digest:string;subject:string;owner:string;
  state:"approved"|"pending"|"withdrawn"|"preview-only";edition:"current"|"archive";
};
export type AutomationLaunchEvidence = {
  title:string;operation:string;owner:string;current:string;records:LaunchConsent[];
  request:LaunchPlannerInput;futureAnchor:number;existing:string|null;requiresBound:boolean;
};
export type AutomationLaunchChoice = {
  action:"activate"|"hold";basis:"authorized"|"pending"|"withdrawn"|"preview-only"|"scope-mismatch"|"ambiguous"|"already-active"|"invalid-plan";
  consent:LaunchConsent|null;reason:string;
};
export type AutomationLaunchReceipt = {
  missionId:string;revisionDigest:string;revision:number;nextRunAt:number|null;recovered:boolean;
};
export type AutomationActivation = {
  status:"activated"|"held"|"moved";receipt:AutomationLaunchReceipt|null;evidenceRevision:string;
};
export type AutomationLaunchReadback = {
  missionId:string;owner:string;trigger:LaunchTrigger;revisionDigest:string;
  nextRunAt:number|null;runCount:number;state:"active"|"paused";
}|null;
export type AutomationLaunchReview = {evidence:AutomationLaunchEvidence;plan:LaunchPlan|null;decision:AutomationLaunchChoice};
export type OwnedAutomationActivationReport = AutomationLaunchReview & {
  activation:AutomationActivation|null;readback:AutomationLaunchReadback;
};
