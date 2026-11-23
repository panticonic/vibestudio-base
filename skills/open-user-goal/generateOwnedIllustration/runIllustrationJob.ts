import readNativeImageOutcome from "./runIllustrationJob/readNativeImageOutcome.js";
import type {IllustrationAssignment,IllustrationBasis,IllustrationDecision,IllustrationOutcome} from "./types.js";
export default async function runIllustrationJob(assignment:IllustrationAssignment,basis:IllustrationBasis,decision:IllustrationDecision):Promise<IllustrationOutcome>{return readNativeImageOutcome(assignment,basis,decision);}
