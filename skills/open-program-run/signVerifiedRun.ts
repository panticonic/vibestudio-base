import {programReceiptSigner} from "natlang:services";
import type {SignedOutputReceipt} from "./types.js";
/** Stage an authorized signature on an independently verified current output. */
export default async function signVerifiedRun(receiptId: string):Promise<SignedOutputReceipt | null>{
 return programReceiptSigner.stage(receiptId);
}
