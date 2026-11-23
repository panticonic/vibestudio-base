import type {RegencyResult,RegencyForecast,RegencyFinding,RegencyDecision,RegencyAdvance,RegencyNote} from "./types.js";
export default function applicationResult(forecasts:RegencyForecast[],findings:RegencyFinding[],decision:RegencyDecision,advance:RegencyAdvance|null,note:RegencyNote|null):RegencyResult {return {forecasts,findings,decision,advance,note};}
