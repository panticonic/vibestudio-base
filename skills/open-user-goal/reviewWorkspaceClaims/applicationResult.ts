import type {ClaimDisposition,ClaimHandoff,ClaimResult,ClaimSupport} from "./types.js";
export default function applicationResult(support:ClaimSupport,disposition:ClaimDisposition,handoff:ClaimHandoff|null):ClaimResult {return {support,disposition,handoff};}
