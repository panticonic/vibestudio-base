import {imageCandidateBriefs} from "natlang:services";
import type {ImageIndex} from "./types.js";
/** Discover owned image briefs and the attributed retained journal. */
export default async function discoverImageBriefs():Promise<ImageIndex>{
 return imageCandidateBriefs.list();
}
