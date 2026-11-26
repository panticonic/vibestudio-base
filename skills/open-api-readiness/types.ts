export type IntegrationUse = "fetch"|"publish"|"git-http"|"git-ssh";
export type Destination = {id:string;purpose:string;use:IntegrationUse;required:boolean};
export type DestinationObservation = {id:string;receipt:string;state:"missing"|"unverified"|"active"|"expired"|"revoked";canRefresh:boolean|null};
export type BoundReport = {planReceipt:string;destinations:{observation:DestinationObservation;
  disposition:"ready"|"setup-needed"|"renewal-needed"|"authorization-unverified"}[];held:string[];
  status:"ready"|"setup-needed"|"renewal-needed"|"authorization-unverified";guidance:string|null};
export type PublicDestination = Destination & {audience:string};
export type Profile = {id:string;title:string;revision:string;destinations:PublicDestination[]};
export type QuietScope = {contextId:string;channelId:string;revision:string;approvals:"pregranted-only";mayStage:boolean};
export type IntegrationIndex = {scope:QuietScope;profiles:Profile[]};
export type SelectionRow = {messageId:string;envelopeId:string;seq:number;selection:{
  profileId:string;contextId:string;revision:string;sender:"owner-selection"|"copied-message";
}};
export type SelectionFrontier = {channelId:string;through:number;rows:SelectionRow[]};
export type SelectionChoice = {profileId:string|null;reason:"selected"|"ambiguous-plan"|"unavailable-plan"};
export type SelectionWitness = {message:string|null;reason:"selected"|"ambiguous-plan"|"unavailable-plan"|
  "unconfirmed-selection"|"foreign-selection"|"stale-selection"};
export type QuietRequest = {operationId:string;goal:string};
export type LookupFact = {destination:string;transport:IntegrationUse;audience:string;
  authorization:"pregranted"|"no-match"|"ambiguous"|"actor-refused"|"grant-not-current";state:DestinationObservation["state"];
  matched: {audience:string;match:"origin"|"path-prefix"|"exact";selection:"trusted-label"|"unique-audience"}|null;
};
export type QuietAudit = {approvals:"pregranted-only";providerAccess:"unobserved";facts:LookupFact[]};
export type IntegrationReadinessPlan = {profileId:string|null;channelId:string;through:number;message:string|null;
  reason:string;action:"hold"|"escalate"|"report"|"stage";providerAccess:"unobserved";explanation:string};
export type ReadinessArtifact = {path:string;sha256:string;bytes:number};
export type ReadinessReport = {plan:IntegrationReadinessPlan;review:{request:QuietRequest;result:BoundReport}|null;
  audit:QuietAudit|null;handoff:ReadinessArtifact|null};

export type ApiReadinessResult = {plan:IntegrationReadinessPlan;review:BoundReport|null;facts:LookupFact[];handoff:ReadinessArtifact|null};

/** Actual asynchronous selection observations, without any lookup or writer capability. */
export type IntegrationHistory = {earlier:SelectionFrontier;current:SelectionFrontier};
