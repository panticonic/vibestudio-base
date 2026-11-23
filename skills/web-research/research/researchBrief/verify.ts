/** Exact checks on what the model produced: a quote must be in its page, a statement must cite existing claims. Semantic entailment is a language judgment. */
import type { WebEvidence, WebStatement } from "../types.js";

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** Characters of a passage given to the model at once. */
export const WINDOW = 4500;

/** The consecutive windows of a page's text. */
export function windows(text: string): string[] {
  const count = Math.ceil(text.length / WINDOW);
  const out: string[] = [];
  for (let index = 0; index < count; index++)
    out.push(text.slice(index * WINDOW, (index + 1) * WINDOW));
  return out;
}

/** WebEvidence whose nonempty quote is present in the page text (whitespace aside), kept once. */
export function checkedEvidence(
  evidence: readonly WebEvidence[],
  pageText: string,
): WebEvidence[] {
  const page = collapse(pageText);
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const quote = collapse(item.quote);
    if (
      quote.length === 0 ||
      item.claim.trim() === "" ||
      !page.includes(quote) ||
      seen.has(quote)
    )
      return false;
    seen.add(quote);
    return true;
  });
}

/** Check nonempty statements and exact claim references. Meaning is judged by the semantic synthesis and independent review. */
export function checkedStatements(
  statements: readonly WebStatement[],
  claims: ReadonlyMap<number, string>,
): WebStatement[] {
  return statements.filter((statement) => {
    if (
      statement.text.trim() === "" ||
      statement.cites.length === 0 ||
      statement.cites.some((id) => !claims.has(id))
    )
      return false;
    return true;
  });
}

/** The publication or update date a page states near its top, as YYYY-MM-DD, or null. */
export function statedDate(text: string): string | null {
  const head = text.slice(0, 2500);
  const iso =
    /(?:published|updated|last modified|modified|date)\W{0,20}(\d{4}-\d{2}-\d{2})/i.exec(
      head,
    );
  if (iso) return iso[1]!;
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const long =
    /(?:published|updated|last modified|posted)\W{0,20}(?:(\d{1,2})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{1,2})),?\s+(\d{4})/i.exec(
      head,
    );
  if (!long) return null;
  const month = months.indexOf((long[2] ?? long[3]!).toLowerCase());
  const day = Number(long[1] ?? long[4]);
  return month < 0
    ? null
    : `${long[5]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
