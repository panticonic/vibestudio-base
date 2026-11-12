/**
 * Which rows an utterance names in so many words. Exact work: names, handles, chat surfaces, run statuses and the
 * few words that name a role (the supervisor, the channel, a subagent run), compared as whole words with accents folded.
 */
import type { AddresseeRow } from "../types.js";

const words = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);

const ROLE_WORDS: Record<string, readonly string[]> = {
  channel: ["everyone", "everybody", "channel", "team", "group", "whole"],
  supervisor: ["supervisor", "parent", "spawned", "boss"],
  "subagent run": ["subagent", "subagents", "run", "runs", "child"],
};

const STATUS_WORDS: Record<string, readonly string[]> = {
  running: ["running", "active", "working"],
  completed: ["completed", "finished", "done"],
  failed: ["failed", "failing", "broken"],
};

/** The words of a row that point at it: the more of them an utterance holds, the better the row is named. */
function evidence(row: AddresseeRow): Set<string> {
  const found = new Set<string>(ROLE_WORDS[row.kind] ?? []);
  if (row.kind === "subagent run") {
    for (const word of words(row.note))
      for (const synonym of STATUS_WORDS[word] ?? []) found.add(synonym);
  } else if (row.kind !== "channel" && row.kind !== "supervisor") {
    for (const word of words(row.ref.replace(/^(?:@|participant:|user:)/, "")))
      found.add(word);
    for (const word of words(row.note)) found.add(word);
  }
  return found;
}

/**
 * The indexes of the rows the utterance names best: those holding the most distinct evidence words, when at least one.
 * Several indexes mean the utterance does not tell those rows apart.
 */
export default function lexical(
  utterance: string,
  rows: readonly AddresseeRow[],
): number[] {
  const said = new Set(words(utterance));
  const scores = rows.map(
    (row) => [...evidence(row)].filter((word) => said.has(word)).length,
  );
  const best = Math.max(0, ...scores);
  return best === 0
    ? []
    : scores.flatMap((score, index) => (score === best ? [index] : []));
}
