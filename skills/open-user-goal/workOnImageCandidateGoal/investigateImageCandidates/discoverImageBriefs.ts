import nativeRead from "../workspace/discoverImageBriefs.js";
import type {ImageIndex} from "../types.js";
/** Exact owned native adapter; the semantic investigation chooses when to read. */
export default function discoverImageBriefs():Promise<ImageIndex>{return nativeRead();}
