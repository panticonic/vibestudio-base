export * from "./workspace/types.js";

import type {RouteOffer,RouteAuthorityReport,RouteChoice} from "./workspace/types.js";

export type RouteInquiry={offer:RouteOffer;authority:RouteAuthorityReport;choice:RouteChoice};
