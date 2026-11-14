/** The sentence of a text that shares the most words with a claim (the earliest on a tie); null when none shares any. */
import spans from "./spans.js";
import overlap from "./overlap.js";

export default function quoteFor(text: string, claim: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const span of spans(text)) {
    const score = overlap(claim, span.text);
    if (score > bestScore) {
      best = span.text;
      bestScore = score;
    }
  }
  return best;
}
