/**
 * Resolve a named recipient to the exact ref `notify` takes: the row the request names in so many words, never a
 * guess between rows it names equally well, and the whole roster back when it names none. Only the addressee phrase is
 * read: the object of the verb ("tell Maria on her phone that lunch is ready" names "Maria on her phone"), never the
 * message body, which may use the same words ("tell Priya the run is done" is not about a subagent run). Names,
 * handles, chat surfaces, run statuses and the few words that name a role (the supervisor, the channel, a subagent
 * run) are compared as whole words with accents folded. A request whose addressee phrase cannot be isolated, or a
 * paraphrase ("the one who reviews my PRs"), is left to the caller, who reads the returned roster: a model choosing
 * among the rows named the wrong recipient in measurement, so none is asked.
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
  agent: ["agent", "agents"],
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

/**
 * The verbs that introduce an addressee, the way a request is phrased ("tell Maria", "report back to the supervisor",
 * "check with the subagent"). Words that are nouns as often as verbs ("update", "text", "page") are left out: a body
 * that mentions one must not start an addressee phrase.
 */
const ADDRESS_VERB =
  /\b(?:(?:tell|ask|notify|message|ping|inform|remind|email|dm|warn|have|steer|let|cc)|(?:report(?: back)?(?: to)?|(?:reply|respond|get back|write) to|check with|loop in))\s+/iu;
/** "send the build results to the builder": the addressee follows the first "to". */
const HAND_OVER = /\b(?:send|forward|pass|hand|give)\b[^,.:;!?]*?\bto\s+/iu;
/** "send Maria the build results": the addressee follows the verb. */
const DIRECT_HAND_OVER = /\b(?:send|forward|give)\s+/iu;

/** Words that begin the message or its purpose, wherever they stand. */
const MESSAGE_WORDS = new Set([
  "that",
  "to",
  "about",
  "whether",
  "if",
  "what",
  "when",
  "why",
  "how",
  "where",
  "with",
  "for",
  "so",
  "because",
  "regarding",
  "toward",
  "towards",
  "know",
  "hear",
]);
/** Words that begin the message's own sentence once the addressee phrase has begun: "tell Priya *the* run is done". */
const SENTENCE_STARTS = new Set([
  "the",
  "a",
  "an",
  "this",
  "these",
  "those",
  "my",
  "our",
  "your",
  "its",
  "it",
  "we",
  "i",
  "you",
  "there",
  "they",
]);
/** After these a determiner still belongs to the addressee: "one *of the* agents", "everyone *in the* channel". */
const PHRASE_CONNECTORS = new Set(["of", "in", "on", "at", "from", "and", "or"]);

const bareWord = (token: string): string =>
  token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * The addressee phrase of a request: the words after its first verb that introduces one, up to where the message
 * begins; null when no such verb is found. The message begins at a word only a message starts with, or at a
 * determiner or pronoun after the phrase has begun ("Priya | the run is done").
 */
function addresseePhrase(request: string): string | null {
  const introduction = [HAND_OVER, ADDRESS_VERB, DIRECT_HAND_OVER]
    .map((pattern) => pattern.exec(request))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((left, right) => left.index - right.index)[0];
  if (!introduction) return null;
  const phrase: string[] = [];
  for (const token of request.slice(introduction.index + introduction[0].length).split(/\s+/)) {
    const word = bareWord(token);
    const connected = PHRASE_CONNECTORS.has(bareWord(phrase.at(-1) ?? ""));
    if (MESSAGE_WORDS.has(word) || (phrase.length > 0 && !connected && SENTENCE_STARTS.has(word))) break;
    phrase.push(token);
    if (/[,;:!?.]$/u.test(token)) break;
  }
  return phrase.join(" ");
}

/** The rows the phrase names best: those holding the most distinct evidence words, when at least one. */
function namedRows(phrase: string, rows: readonly AddresseeRow[]): AddresseeRow[] {
  const said = new Set(words(phrase));
  const scores = rows.map((row) => [...evidence(row)].filter((word) => said.has(word)).length);
  const best = Math.max(0, ...scores);
  return best === 0 ? [] : rows.filter((_, index) => scores[index] === best);
}

/**
 * Who the user named. `utterance` is the request ("Tell Maria the build passed"); `rows` are the recipients the agent
 * can message, as `agent.addressees()` returns them. One recipient per call: resolve each name of a list separately.
 */
export function resolveAddressee(
  utterance: string,
  rows: readonly AddresseeRow[],
): AddresseeResolution {
  const phrase = addresseePhrase(utterance);
  const named = phrase === null ? [] : namedRows(phrase, rows);
  if (named.length === 1) return { kind: "ref", ref: named[0]!.ref, note: named[0]!.note };
  if (named.length > 1) return { kind: "ambiguous", reason: "several", candidates: named };
  return { kind: "ambiguous", reason: "none", candidates: [...rows] };
}
