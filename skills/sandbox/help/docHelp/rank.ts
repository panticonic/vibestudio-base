/** BM25 lexical ranking over the finite exact candidate passages; no answer labels or source preferences. */
export type Passage = { source: string; section: string; text: string };

export default function rank(
  terms: readonly string[],
  passages: readonly Passage[],
): Passage[] {
  const documents = passages.map((passage) =>
    `${passage.section}\n${passage.text}`.toLowerCase(),
  );
  const lengths = documents.map(
    (document) => document.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0,
  );
  const average =
    lengths.reduce((sum, length) => sum + length, 0) /
      Math.max(documents.length, 1) || 1;
  const frequencies = terms.map((term) =>
    documents.map((document) => document.split(term.toLowerCase()).length - 1),
  );
  const weights = frequencies.map((counts) =>
    Math.log(
      1 +
        (documents.length - counts.filter(Boolean).length + 0.5) /
          (counts.filter(Boolean).length + 0.5),
    ),
  );
  return passages
    .map((passage, index) => ({
      passage,
      score: frequencies.reduce((sum, counts, term) => {
        const frequency = counts[index]!;
        return (
          sum +
          (weights[term]! * frequency * 2.2) /
            (frequency + 1.2 * (0.25 + (0.75 * lengths[index]!) / average))
        );
      }, 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.passage.source.localeCompare(b.passage.source) ||
        a.passage.section.localeCompare(b.passage.section),
    )
    .map(({ passage }) => passage);
}
