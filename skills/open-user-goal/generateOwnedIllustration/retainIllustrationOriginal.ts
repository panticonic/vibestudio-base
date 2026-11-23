import writeVerifiedOriginal from "./retainIllustrationOriginal/writeVerifiedOriginal.js";
import type {IllustrationAssignment,IllustrationBasis,IllustrationOutcome,IllustrationSave} from "./types.js";
export default async function retainIllustrationOriginal(assignment:IllustrationAssignment,basis:IllustrationBasis,outcome:IllustrationOutcome):Promise<IllustrationSave>{return writeVerifiedOriginal(assignment,basis,outcome);}
