import {ownedSpecialistRun} from "natlang:services";
import type {SpecialistSnapshot} from "./types.js";
/** Read one owned channel's retained specialist attempt and result frontier. */
export default async function readRetainedSpecialistRun(channelId: string):Promise<SpecialistSnapshot | null>{
 return ownedSpecialistRun.read(channelId);
}
