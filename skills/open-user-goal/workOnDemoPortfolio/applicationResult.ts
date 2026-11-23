import type {PortfolioResult,PortfolioProjection,GardenResult,RealmResult,PortfolioDecision,PortfolioNote} from "./types.js";
export default function applicationResult(projection:PortfolioProjection|null,garden:GardenResult[],realm:RealmResult[],decision:PortfolioDecision,note:PortfolioNote|null):PortfolioResult {return {projection,garden,realm,decision,note};}
