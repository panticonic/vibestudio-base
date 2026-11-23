import type {RegencyResult} from "./types.js";
export default function applicationResult(forecasts:RegencyResult["forecasts"],findings:RegencyResult["findings"],decision:RegencyResult["decision"],advance:RegencyResult["advance"],note:RegencyResult["note"]):RegencyResult {return {forecasts,findings,decision,advance,note};}
