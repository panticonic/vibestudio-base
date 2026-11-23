import {nativeCoordinatedRevision} from "natlang:services";
import type {RevisionDraft, RevisionReceipt} from "./types.js";
/** Atomically apply the authorized native document edit batch against its exact working revision. */
export default async function applyRevisionBatch(head: string, drafts: RevisionDraft[]):Promise<RevisionReceipt>{
 return nativeCoordinatedRevision.revise(head, drafts);
}
