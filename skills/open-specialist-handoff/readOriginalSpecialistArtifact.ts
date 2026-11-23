import {ownedSpecialistArtifact} from "natlang:services";
import type {OriginalArtifact} from "./types.js";
/** Read back exact bytes for one eligible original specialist completion. */
export default async function readOriginalSpecialistArtifact(channelId: string, resultMessage: string):Promise<OriginalArtifact | null>{
 return ownedSpecialistArtifact.read(channelId, resultMessage);
}
