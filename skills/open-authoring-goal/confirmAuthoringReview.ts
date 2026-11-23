import {authoringReviewControl} from "natlang:services";
import type {AuthoringReceipt} from "./types.js";
/** Confirm the selected program versions still match the observed compiler evidence. */
export default async function confirmAuthoringReview(receipt: AuthoringReceipt):Promise<"current" | "changed">{
 return authoringReviewControl.confirm(receipt);
}
