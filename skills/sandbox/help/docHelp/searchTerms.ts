/** Exact search-interface normalization; relevance and vocabulary belong to keywords.nl. */
export default function searchTerms(terms: readonly string[]): string[] {
  const normalized = [
    ...new Set(terms.map((term) => term.trim()).filter(Boolean)),
  ];
  if (!normalized.length)
    throw new Error(
      "Return at least one nonempty search word or phrase for the requested information.",
    );
  return normalized;
}

/** Treat a chosen search term literally rather than as regular-expression syntax. */
export const escapeTerm = (term: string): string =>
  term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
