/** The sentence of a text that holds a pattern's first match (case-insensitive), or null when the pattern does not occur. */
import spans from "./spans.js";

export default function matchedSpan(text: string, pattern: string): string | null {
  const found = new RegExp(pattern, "iu").exec(text);
  if (!found) return null;
  const at = found.index;
  return spans(text).find((span) => at >= span.start && at < span.end)?.text ?? found[0];
}
