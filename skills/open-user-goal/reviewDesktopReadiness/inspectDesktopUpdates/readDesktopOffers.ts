import {desktopReadiness} from "natlang:services";
import type {DesktopUpdateObservation} from "../../types.js";
/** Read the installed desktop offer projection and replay notices. */
export default async function readDesktopOffers(id: string):Promise<DesktopUpdateObservation>{
 return desktopReadiness.readUpdates(id);
}
