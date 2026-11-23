import {goalSuite} from "natlang:services";
import chooseSuiteRoute from "./verifyWorkspaceSuite/chooseSuiteRoute.nl";
import reviewTestSuite from "./verifyWorkspaceSuite/suites/reviewTestSuite.nl";
import type {WorkspaceSuiteReport} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function verifyWorkspaceSuite(goal:string):Promise<WorkspaceSuiteReport>{
 const routes=await goalSuite.discover();
 const choice=await chooseSuiteRoute(goal,routes);
 if(!choice)return {status:"blocked",reason:"No declared route matches the requested verification scope."};
 const request=await goalSuite.prepare(choice);
 if(!request)return {status:"blocked",reason:"The selected suite route cannot be bound to the current authorized workspace."};
 const review=await reviewTestSuite(request);
 return {status:"suite-reviewed",review};
}
