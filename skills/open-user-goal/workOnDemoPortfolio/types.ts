export * from "./portfolio/types.js";

import type {PortfolioProjection,GardenResult,RealmResult,PortfolioDecision,PortfolioNote} from "./portfolio/types.js";

export type PortfolioResult = {projection:PortfolioProjection|null;garden:GardenResult[];realm:RealmResult[];decision:PortfolioDecision;note:PortfolioNote|null};
