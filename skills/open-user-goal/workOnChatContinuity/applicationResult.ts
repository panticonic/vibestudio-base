import type {ChatDisposition,ChatHandoff,ChatResult,ReviewedDelivery} from "./types.js";
export default function applicationResult(review:ReviewedDelivery,disposition:ChatDisposition,handoff:ChatHandoff|null):ChatResult {return {review,disposition,handoff};}
