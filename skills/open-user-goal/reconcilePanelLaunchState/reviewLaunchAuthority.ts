import reviewAuthority from "./reviewLaunchAuthority/authority/reviewAuthority.nl";
import type {LaunchAuthorityRequest,LaunchAuthorityReport} from "./types.js";
/** Preserve the installed authority judgment for the exact bound operation. */
export default async function reviewLaunchAuthority(request:LaunchAuthorityRequest):Promise<LaunchAuthorityReport>{return reviewAuthority(request);}
