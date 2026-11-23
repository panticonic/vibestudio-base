import {quietIntegrationIndex} from "natlang:services";
import type {IntegrationIndex} from "./types.js";
/** Discover the assigned quiet integration inventory and public destinations. */
export default async function discoverIntegrationReview():Promise<IntegrationIndex>{
 return quietIntegrationIndex.list();
}
