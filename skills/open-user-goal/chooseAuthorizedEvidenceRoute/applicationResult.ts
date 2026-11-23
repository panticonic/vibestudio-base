import type {RouteHandoff,RouteOutcome,RouteReadback,RouteResult} from "./types.js";
export default function applicationResult(readback:RouteReadback|null,outcome:RouteOutcome,handoff:RouteHandoff|null):RouteResult {return {readback,outcome,handoff};}
