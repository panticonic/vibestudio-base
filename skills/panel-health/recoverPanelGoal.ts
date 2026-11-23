import {panelRecovery} from "natlang:services";
import chooseRecoverySurface from "./recoverPanelGoal/chooseRecoverySurface.nl";
import recoverSurface from "./recoverPanelGoal/recoverSurface.nl";
import applicationResult from "./recoverPanelGoal/applicationResult.js";
import type {PanelRecoveryResult} from "./types.js";
export default async function recoverPanelGoal(goal:string):Promise<PanelRecoveryResult>{
 const catalog=await panelRecovery.discover(),surface=await chooseRecoverySurface(goal,catalog);
 if(!surface)return {status:"unresolved",reason:"The current owned catalog does not identify one requested surface."};
 const binding=await panelRecovery.bind(catalog.revision,surface);
 if(!binding)return {status:"unresolved",reason:"The selected surface could not be bound to the observed catalog revision."};
 return applicationResult(await recoverSurface(goal,binding));
}
