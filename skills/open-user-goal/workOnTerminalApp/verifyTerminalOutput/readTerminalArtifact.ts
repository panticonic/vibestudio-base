import {terminalRepairArtifact} from "natlang:services";
import type {TerminalRepairArtifact} from "../../types.js";
/** Read the build store's terminal runtime artifact for the verified revision. */
export default async function readTerminalArtifact(appId: string, revision: string):Promise<TerminalRepairArtifact | null>{
 return terminalRepairArtifact.read(appId, revision);
}
