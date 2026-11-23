import {welcomeResourceIndex} from "natlang:services";
import type {WelcomeIndex} from "./types.js";
/** Read the current assigned Personal resources with their canonical owner roles. */
export default async function discoverWelcomeResources():Promise<WelcomeIndex>{
 return welcomeResourceIndex.list();
}
