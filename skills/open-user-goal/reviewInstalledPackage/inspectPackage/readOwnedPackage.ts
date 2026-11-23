import {installedPackageRead} from "natlang:services";
import type {PackageObservation} from "../types.js";
/** Read the exact assigned installed worker and its two manifest states. */
export default async function readOwnedPackage(operationId: string):Promise<PackageObservation>{
 return installedPackageRead.inspect(operationId);
}
