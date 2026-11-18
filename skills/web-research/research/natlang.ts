import researchBrief from "./researchBrief.nl";
import type { CitedBrief } from "./types.js";

/** Answer a question from web pages, every statement cited. `sources` are URLs to read first; empty means search. */
export function brief(
  question: string,
  sources: string[],
  retrievedAt: number = Date.now(),
): Promise<CitedBrief> {
  return researchBrief(question, sources, retrievedAt);
}

export { researchBrief };
