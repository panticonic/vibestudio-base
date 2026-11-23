import {quietIntegrationJournal} from "natlang:services";
import type {SelectionFrontier} from "./types.js";
/** Read the owned integration selection from its native retained frontier. */
export default async function readIntegrationSelection(channelId: string):Promise<SelectionFrontier | null>{
 return quietIntegrationJournal.read(channelId);
}
