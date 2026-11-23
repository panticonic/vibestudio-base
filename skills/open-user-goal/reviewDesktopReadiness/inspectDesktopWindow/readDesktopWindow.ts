import {desktopReadiness} from "natlang:services";
import type {DesktopWindowObservation} from "../../types.js";
/** Read the owned placement parser and replay result. */
export default async function readDesktopWindow(id: string):Promise<DesktopWindowObservation>{
 return desktopReadiness.readWindow(id);
}
