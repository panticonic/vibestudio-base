import findPortfolio from "./workOnDemoPortfolio/portfolio/findPortfolio.js";
import readPortfolioFrame from "./workOnDemoPortfolio/portfolio/readPortfolioFrame.js";
import readPortfolioForecast from "./workOnDemoPortfolio/portfolio/readPortfolioForecast.js";
import stagePortfolioHandoff from "./workOnDemoPortfolio/portfolio/stagePortfolioHandoff.js";
import choosePortfolioCriteria from "./workOnDemoPortfolio/choosePortfolioCriteria.nl";
import reviewPortfolioGarden from "./workOnDemoPortfolio/reviewPortfolioGarden.nl";
import reviewPortfolioRealm from "./workOnDemoPortfolio/reviewPortfolioRealm.nl";
import decidePortfolioDelivery from "./workOnDemoPortfolio/decidePortfolioDelivery.nl";
import applicationResult from "./workOnDemoPortfolio/applicationResult.js";
import type {PortfolioResult,PortfolioReport} from "./workOnDemoPortfolio/types.js";
export default async function workOnDemoPortfolio(goal:string):Promise<PortfolioResult>{
 const index=await findPortfolio(),opening=await readPortfolioFrame(index.id),current=await readPortfolioFrame(index.id);
 if(!opening||!current)throw new Error("The assigned portfolio checkpoint is unavailable");
 const plan=await choosePortfolioCriteria(goal,opening,current);
 const projection=plan.months===null?null:await readPortfolioForecast(index.id,current.id,plan.months);
 const [garden,realm]=await Promise.all([reviewPortfolioGarden(plan.garden,opening,current),reviewPortfolioRealm(plan.realm,opening,current,projection)]);
 const decision=await decidePortfolioDelivery(goal,current,plan,garden,realm);
 const report:PortfolioReport={plan,opening,current,projection,garden,realm,decision,note:null};
 const note=decision.write?await stagePortfolioHandoff(report):null;
 return applicationResult(projection,garden,realm,decision,note);
}
