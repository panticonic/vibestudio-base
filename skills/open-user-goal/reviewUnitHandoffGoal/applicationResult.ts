import type {UnitHandoffFindings,UnitHandoffUnit,UnitIdentityChange} from "./types.js";
/** Preserve the actual requested answer and native unit/draft values. */
export default function applicationResult(explanation:string,unit:UnitHandoffUnit|null,draft:UnitIdentityChange|null):UnitHandoffFindings{return {explanation,unit,draft};}
