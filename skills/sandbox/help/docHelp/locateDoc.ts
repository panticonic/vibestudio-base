/**
 * Locate where the documentation answers a question. Code finds and ranks the candidate sections (the Markdown files a
 * ripgrep for the question's terms hits, split by heading, and the capability catalog's entries); the executor judges
 * each candidate once; the quotes are the sections' own text.
 */
import { docs, fs } from "natlang:services";
import fits from "./fits.nl";
import keywords from "./keywords.js";
import sections from "./sections.js";
import type { DocScope, Found, Located } from "../types.js";

/** Sections judged per question: each costs one scored decision. */
const CANDIDATES = 6;
/** Files read, the ones the most distinct terms hit. */
const FILES = 5;
/** Catalog entries considered. */
const CATALOG = 2;
/** Sections returned. */
const QUOTES = 3;

type Candidate = { source: string; section: string; text: string; score: number };

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** An identifier counts three, a word one; each term once. */
function score(terms: readonly string[], text: string): number {
  const lower = text.toLowerCase();
  return terms
    .filter((term) => lower.includes(term.toLowerCase()))
    .reduce((sum, term) => sum + (/[._A-Z]/u.test(term) ? 3 : 1), 0);
}

const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;

async function fileCandidates(terms: readonly string[], scope: DocScope | undefined): Promise<Candidate[]> {
  const pattern = terms.map(escape).join("|");
  const roots: Array<string | undefined> = scope?.paths?.length ? scope.paths : [undefined];
  const searches = await Promise.all(
    roots.map((path) =>
      fs.grep(pattern, { ...(path ? { path } : {}), glob: "*.md", caseInsensitive: true, maxMatches: 1000 }),
    ),
  );
  const lines = new Map<string, string[]>();
  for (const hit of searches.flatMap((search) => search.matches)) {
    lines.set(hit.file, [...(lines.get(hit.file) ?? []), hit.line]);
  }
  const files = [...lines.entries()]
    .map(([file, hits]) => ({ file, score: score(terms, hits.join("\n")) }))
    .sort(byScore)
    .slice(0, FILES);
  const read = await Promise.all(
    files.map(async ({ file }) => ({ file, text: (await fs.readText(file, { maxBytes: 262144 })).text })),
  );
  return read.flatMap(({ file, text }) =>
    sections(text).map((section) => ({
      source: file,
      section: section.heading || file,
      text: section.text,
      score: score(terms, section.text),
    })),
  );
}

async function catalogCandidates(terms: readonly string[]): Promise<Candidate[]> {
  const hits = await docs.search(terms.join(" "), { limit: CATALOG });
  const entries = await Promise.all(hits.map((hit) => docs.describe(hit.id)));
  return entries.flatMap((entry) =>
    entry?.description
      ? [
          {
            source: `docs:${entry.id}`,
            section: entry.qualifiedName,
            text: entry.description,
            score: score(terms, `${entry.qualifiedName} ${entry.description}`),
          },
        ]
      : [],
  );
}

export default async function locateDoc(question: string, scope?: DocScope): Promise<Located> {
  const terms = keywords(question);
  if (terms.length === 0) return { found: [], tried: [] };
  const [files, catalog] = await Promise.all([
    fileCandidates(terms, scope),
    // A scope names files; the catalog is not one.
    scope?.paths?.length ? Promise.resolve([]) : catalogCandidates(terms),
  ]);
  const candidates = [...catalog, ...files]
    .filter((candidate) => candidate.score > 0)
    .sort(byScore)
    .slice(0, CANDIDATES);
  const judged = await Promise.all(candidates.map((candidate) => fits(question, candidate.text)));
  const kept = (fit: "answers" | "related"): Found[] =>
    candidates.flatMap((candidate, index) =>
      judged[index] === fit
        ? [{ source: candidate.source, section: candidate.section, quote: candidate.text, fit }]
        : [],
    );
  return {
    found: [...kept("answers"), ...kept("related")].slice(0, QUOTES),
    tried: [...new Set(candidates.map((candidate) => candidate.source))],
  };
}
