/**
 * The sections of a Markdown document: each heading with the text under it, in pieces of whole paragraphs of at most
 * `limit` characters (a longer paragraph is cut at the limit). Every piece is an exact slice of the document. Headings
 * inside code fences are text.
 */

export type Section = { heading: string; text: string };

/** The paragraphs of `body` as [start, end) offsets into it. */
function paragraphs(body: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (const gap of body.matchAll(/\n[ \t]*\n/gu)) {
    out.push([start, gap.index]);
    start = gap.index + gap[0].length;
  }
  out.push([start, body.length]);
  return out.filter(([from, to]) => body.slice(from, to).trim() !== "");
}

export default function sections(document: string, limit: number = 1200): Section[] {
  const headings: string[] = [];
  const out: Section[] = [];
  let fenced = false;
  let start = 0;
  let offset = 0;
  const close = (end: number) => {
    const body = document.slice(start, end);
    const heading = headings.filter(Boolean).join(" > ");
    let piece: [number, number] | null = null;
    const emit = ([from, to]: [number, number]) => {
      const text = body.slice(from, Math.min(to, from + limit)).trim();
      if (text) out.push({ heading, text });
    };
    for (const [from, to] of paragraphs(body)) {
      if (piece && to - piece[0] <= limit) {
        piece = [piece[0], to];
        continue;
      }
      if (piece) emit(piece);
      piece = [from, to];
    }
    if (piece) emit(piece);
  };
  for (const line of document.split("\n")) {
    if (/^\s*(?:```|~~~)/u.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,6})\s+(.*\S)\s*$/u.exec(line);
    if (heading) {
      close(offset);
      const depth = heading[1]!.length;
      headings.length = depth - 1;
      headings[depth - 1] = heading[2]!;
      start = offset;
    }
    offset += line.length + 1;
  }
  close(document.length);
  return out;
}
