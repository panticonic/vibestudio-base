import stagePortfolioHandoff from "./portfolio/stagePortfolioHandoff.js";
import applicationResult from "./applicationResult.js";
import type {PortfolioReport,PortfolioResult} from "./types.js";
/** Exact optional effect boundary; the semantic caller decides the requested findings and action. */
export default async function finishPortfolioReport(report:PortfolioReport):Promise<PortfolioResult>{
 const note=report.decision.write?await stagePortfolioHandoff({...report,note:null}):null;
 return applicationResult(report.projection,report.garden,report.realm,report.decision,note);
}
