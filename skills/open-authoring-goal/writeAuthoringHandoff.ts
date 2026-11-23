import {authoringReviewControl} from "natlang:services";
import type {AuthoringHandoff, AuthoringReceipt} from "./types.js";
/** Stage an authorized scratch handoff for already observed compiler evidence. */
export default async function writeAuthoringHandoff(receipt: AuthoringReceipt):Promise<AuthoringHandoff | null>{
 return authoringReviewControl.stage(receipt);
}
