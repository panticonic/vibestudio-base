import readReader from "./reviewNewsReaderWindow/installed/reviewers/readReader.nl";
import type {ReaderSelection,ReaderEvidence,ReaderWitness} from "./types.js";
export default async function reviewNewsReaderWindow(selection:ReaderSelection,input:ReaderEvidence):Promise<ReaderWitness>{return {selection,input,result:await readReader(input)};}
