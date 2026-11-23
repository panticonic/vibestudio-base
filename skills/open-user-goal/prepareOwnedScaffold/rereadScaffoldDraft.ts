import {scaffoldRead} from "natlang:services";
import type {ScaffoldReadback} from "../types.js";
/** Independently read exact generated source at its native draft state. */
export default async function rereadScaffoldDraft(id: string, draft: string | null):Promise<ScaffoldReadback>{
 return scaffoldRead.readback(id, draft);
}
