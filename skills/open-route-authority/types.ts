export type EvidenceBasis="working"|"committed"|"earlier"|"private-copy"|"comparison"|"external"|"alternate-link";
export type VisibleRoute={id:string;basis:EvidenceBasis;label:string;operationIds:string[];origin:string|null};
export type RouteAuthorityScope={capability:string;resourceKey:string};
export type RouteAuthorityRequest={goal:string;operations:{id:string;label:string}[];ceiling:RouteAuthorityScope[]};
export type RouteAuthorityObservation={operationId:string;decision:string;leaves:{capability:string;resourceKey:string;tier:string;status:string}[]};
export type RouteAuthorityReport={status:string;protectedLeaves:RouteAuthorityScope[];held:string[];
  reviews:{observation:RouteAuthorityObservation;outside:RouteAuthorityScope[];disposition:string}[]};
export type RouteOffer={title:string;purpose:string;field:string;routes:VisibleRoute[];request:RouteAuthorityRequest};
export type RouteChoice={routeId:string|null;execute:boolean;retain:boolean;reason:string};
export type ExactRouteRecord={basis:EvidenceBasis;coordinate:string;field:string;value:string;fileHash:string};
export type RouteReadback={routeId:string;records:(ExactRouteRecord|null)[]};
export type RouteOutcome={status:"verified"|"mismatch"|"missing"|"outside-limit"|"needs-approval"|"refused"|"eligible-preflight";summary:string};
export type RouteHandoff={path:string;digest:string};
export type OwnedRouteReview={offer:RouteOffer;authority:RouteAuthorityReport;choice:RouteChoice;readback:RouteReadback|null;
  outcome:RouteOutcome;handoff:RouteHandoff|null};

export type RouteResult = {readback:RouteReadback|null;outcome:RouteOutcome;handoff:RouteHandoff|null};
