import {branchDeliveryRead} from "natlang:services";
/** Bind one exact observed file or the current local Git bridge to an installed review operation. */
export default async function operation(id: string, path: string):Promise<string | null>{
 return branchDeliveryRead.operation(id, path);
}
