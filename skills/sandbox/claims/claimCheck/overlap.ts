/** How many content words two texts share, lowercased and crudely stemmed, so "stored" meets "store" and "files" meets "file". */

const STOP = new Set(
  "the a an and or of to in on for with by at from as is are was were be been it its this that these those not no".split(" "),
);

function words(text: string): Set<string> {
  const tokens: string[] = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return new Set(
    tokens
      .filter((raw) => raw.length >= 2 && !STOP.has(raw))
      .map((raw) => raw.replace(/(?:ing|ed|es|s)$/u, "") || raw),
  );
}

export default function overlap(claim: string, text: string): number {
  const own = words(text);
  let shared = 0;
  for (const word of words(claim)) if (own.has(word)) shared += 1;
  return shared;
}
