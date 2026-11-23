import {installedPackageRead} from "natlang:services";
import type {PackageAssignment} from "./types.js";
/** Discover the owned installed worker package assignment and review scope. */
export default async function discoverPackage():Promise<PackageAssignment>{
 return installedPackageRead.discover();
}
