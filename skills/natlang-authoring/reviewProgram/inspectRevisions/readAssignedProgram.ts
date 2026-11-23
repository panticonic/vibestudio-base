import {authoringCompiler} from "natlang:services";
import type {ProgramReadback, ProgramRole} from "../../types.js";
/** Obtain the compiler description of one assigned program role. */
export default async function readAssignedProgram(role: ProgramRole):Promise<ProgramReadback>{
 return authoringCompiler.inspect(role);
}
