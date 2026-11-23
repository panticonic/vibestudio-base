import {grimoireScene} from "natlang:services";
import type {GrimoireCaretakerScope} from "../../types.js";
/** Read the candidate's actual ownership, frontier and authority. */
export default async function readCaretakerScope(id: string):Promise<GrimoireCaretakerScope>{
 return grimoireScene.readScope(id);
}
