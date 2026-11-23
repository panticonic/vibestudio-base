import {boardMigration} from "natlang:services";
import locateSource from "./reviewBoardMigration/locateSource.nl";
import chooseMigrationScope from "./reviewBoardMigration/chooseMigrationScope.nl";
import decideMigration from "./reviewBoardMigration/decideMigration.nl";
import type {BoardMigrationOutcome} from "./reviewBoardMigration/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewBoardMigration(goal:string):Promise<BoardMigrationOutcome>{
 const view=await locateSource(goal);
 if(!view)return {disposition:"held",receipt:null,reason:"No current source board could be bound to this request."};
 const basis=await boardMigration.readTarget();
 const selection=await chooseMigrationScope(goal,view,basis);
 return decideMigration(goal,view,basis,selection);
}
