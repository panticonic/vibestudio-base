import {scaffoldPrepare} from "natlang:services";
import type {ScaffoldKind, ScaffoldReceipt} from "../types.js";
/** Prepare one exact native draft without publishing. */
export default async function stageNativeScaffold(id: string, event: string, kinds: ScaffoldKind[]):Promise<ScaffoldReceipt | null>{
 return scaffoldPrepare.prepare(id, event, kinds);
}
