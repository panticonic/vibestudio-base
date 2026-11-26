import type {CliRouteFindings} from "./types.js";
import type {RemoteRouteReview,CliContinuation} from "./remote/types.js";
export default function applicationResult(explanation:string,gateway:RemoteRouteReview|null,continuation:CliContinuation|null):CliRouteFindings{return {explanation,gateway,continuation};}
