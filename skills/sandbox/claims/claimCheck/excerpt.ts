/** What the executor reads: the text itself, or, past the limit, the sentences that share most words with the claim, in text order. */
import spans from "./spans.js";
import overlap from "./overlap.js";

export default function excerpt(text: string, claim: string, limit: number = 6000): string {
  if (text.length <= limit) return text;
  const ranked = spans(text)
    .map((span, index) => ({ span, index, score: overlap(claim, span.text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const kept: typeof ranked = [];
  let size = 0;
  for (const entry of ranked) {
    if (size + entry.span.text.length + 1 > limit) continue;
    kept.push(entry);
    size += entry.span.text.length + 1;
  }
  return kept
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.span.text)
    .join("\n");
}
