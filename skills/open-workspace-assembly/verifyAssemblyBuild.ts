import {assemblyBuild} from "natlang:services";
import type {AssemblyBuildReceipt, AssemblyRevision} from "./types.js";
/** Verify one selected package build and read its retained native build artifact metadata. */
export default async function verifyAssemblyBuild(unit: string, head: AssemblyRevision):Promise<AssemblyBuildReceipt | null>{
 return assemblyBuild.verify(unit, head);
}
