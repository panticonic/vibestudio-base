export * from "./portfolio/types.js";

import type {PortfolioReport} from "./portfolio/types.js";

export type PortfolioResult = {projection:PortfolioReport["projection"];garden:PortfolioReport["garden"];realm:PortfolioReport["realm"];decision:PortfolioReport["decision"];note:PortfolioReport["note"]};
