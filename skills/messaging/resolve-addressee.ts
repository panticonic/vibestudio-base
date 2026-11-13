/**
 * Resolve a named recipient to the exact ref `notify` takes: the row the utterance names in so many words, never a
 * guess between rows it names equally well, and the whole roster back when it names none. Names, handles, chat
 * surfaces, run statuses and the few words that name a role (the supervisor, the channel, a subagent run) are compared
 * as whole words with accents folded. A paraphrase ("the one who reviews my PRs") is left to the caller, who reads the
 * returned roster: a model choosing among the rows named the wrong recipient in measurement, so none is asked.
 */
import type { AddresseeRow } from "@workspace/agentic-protocol";

/** The recipient the user meant: one exact ref, ready for `notify`'s `to`. */
export type ResolvedAddressee = { kind: "ref"; ref: string; note: string };

/**
 * No single recipient could be established. Nothing is guessed: the caller asks the user which one, showing
 * `candidates` ("several": more than one row fits or may fit; "none": no row fits, and the candidates are the whole
 * roster).
 */
export type AmbiguousAddressee = {
  kind: "ambiguous";
  reason: "several" | "none";
  candidates: AddresseeRow[];
};

export type AddresseeResolution = ResolvedAddressee | AmbiguousAddressee;

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
    for (const word of words(row.ref.replace(/^(?:@|participant:|user:)/, ""))) found.add(word);
    for (const word of words(row.note)) found.add(word);
  }
  return found;
}

/** The rows the utterance names best: those holding the most distinct evidence words, when at least one. */
function namedRows(utterance: string, rows: readonly AddresseeRow[]): AddresseeRow[] {
  const said = new Set(words(utterance));
  const scores = rows.map((row) => [...evidence(row)].filter((word) => said.has(word)).length);
  const best = Math.max(0, ...scores);
  return best === 0 ? [] : rows.filter((_, index) => scores[index] === best);
}

/**
 * Who the user named. `rows` are the recipients the agent can message, as `agent.addressees()` returns them. One
 * recipient per call: resolve each name of a list separately.
 */
export function resolveAddressee(
  utterance: string,
  rows: readonly AddresseeRow[],
): AddresseeResolution {
  const named = namedRows(utterance, rows);
  if (named.length === 1) return { kind: "ref", ref: named[0]!.ref, note: named[0]!.note };
  if (named.length > 1) return { kind: "ambiguous", reason: "several", candidates: named };
  return { kind: "ambiguous", reason: "none", candidates: [...rows] };
}
