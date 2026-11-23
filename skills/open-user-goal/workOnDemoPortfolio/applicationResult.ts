import type {PortfolioResult} from "./types.js";
export default function applicationResult(projection:PortfolioResult["projection"],garden:PortfolioResult["garden"],realm:PortfolioResult["realm"],decision:PortfolioResult["decision"],note:PortfolioResult["note"]):PortfolioResult {return {projection,garden,realm,decision,note};}
