import {scaffoldRead} from "natlang:services";
import type {ScaffoldOptions} from "../../types.js";
/** Read the exact installed scaffold availability and protected main state. */
export default async function readInstalledScaffolds(id: string):Promise<ScaffoldOptions>{
 return scaffoldRead.options(id);
}
