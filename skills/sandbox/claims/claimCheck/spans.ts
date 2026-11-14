/** The sentences and list items of a text, each an exact slice of it (trimmed, never empty). */

export type Span = { start: number; end: number; text: string };

/**
 * Sentence and list-item boundaries: line breaks, and sentence punctuation after a word, a closing mark or a number of
 * two digits or more, followed by space (so a "1." list marker is not a sentence).
 */
const BOUNDARY = /\n+|(?<=(?:\p{L}|\p{N}{2,}|[)\]"'`*])[.!?])\s+(?=\S)/gu;
/** List markers and indentation that open a line but are not its words. */
const LEADER = /^(?:\s*(?:[-*+•]|\d+[.)])\s+|\s+)/u;

export default function spans(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const a = from + (LEADER.exec(raw)?.[0].length ?? 0);
    const b = from + raw.trimEnd().length;
    if (b > a) out.push({ start: a, end: b, text: text.slice(a, b) });
  };
  for (const boundary of text.matchAll(BOUNDARY)) {
    push(start, boundary.index);
    start = boundary.index + boundary[0].length;
  }
  push(start, text.length);
  return out;
}
