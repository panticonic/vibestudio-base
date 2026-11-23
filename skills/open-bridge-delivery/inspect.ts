import {branchDeliveryRead} from "natlang:services";
import type {DeliveryScope} from "./types.js";
/** Inspect the scope of one retained Git Bridge record and its two local semantic file paths. */
export default async function inspect(id: string):Promise<DeliveryScope | null>{
 return branchDeliveryRead.inspect(id);
}
