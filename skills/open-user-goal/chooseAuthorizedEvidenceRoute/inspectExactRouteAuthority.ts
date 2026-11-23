import reviewAuthority from "./inspectExactRouteAuthority/authority/reviewAuthority.nl";
import type {RouteAuthorityRequest,RouteAuthorityReport} from "./types.js";
export default async function inspectExactRouteAuthority(request:RouteAuthorityRequest):Promise<RouteAuthorityReport>{return reviewAuthority(request);}
