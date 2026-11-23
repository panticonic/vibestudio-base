import {welcomeResourceResolution} from "natlang:services";
import type {WelcomeResolution} from "./types.js";
/** Resolve the selected resource through the current installed catalog and available local diagnostic binding. */
export default async function resolveWelcomeResource(resourceId: string):Promise<WelcomeResolution | null>{
 return welcomeResourceResolution.resolve(resourceId);
}
