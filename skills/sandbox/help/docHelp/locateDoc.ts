/** Search mechanically, then let fits judge successive finite batches until an answer or source exhaustion. */
import { docs, fs } from "natlang:services";
import fits from "./fits.nl";
import keywords from "./keywords.js";
import sections from "./sections.js";
import rank from "./rank.js";
import type { Passage } from "./rank.js";
import type { DocScope, Found, Located } from "../types.js";

/** Concurrent decisions, never a cutoff on the finite search. */
const BATCH = 6;
const QUOTES = 3;
const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

async function readDocument(file: string): Promise<string> {
  const first = await fs.readText(file, {
    offset: 1,
    limit: 10000,
    maxBytes: 1048576,
  });
  type Page = typeof first;
  const continuation = async (
    page: Page,
    remaining: number,
  ): Promise<string> => {
    if (page.firstLineExceedsLimit)
      throw new Error(
        `A line in ${file} exceeds the filesystem read bound; split that documentation line.`,
      );
    if (!page.truncated) return page.text;
    const next = page.nextOffset;
    if (next === undefined || next <= page.startLine || remaining <= 0)
      throw new Error(
        `Documentation read did not advance for ${file}; repair the filesystem continuation.`,
      );
    const following = await fs.readText(file, {
      offset: next,
      limit: 10000,
      maxBytes: 1048576,
    });
    if (following.contentHash !== first.contentHash)
      throw new Error(
        `Documentation changed while reading ${file}; search a stable snapshot.`,
      );
    return (
      page.text +
      "\n" +
      (await continuation(following, remaining - (next - page.startLine)))
    );
  };
  return continuation(first, first.totalLines);
}

async function fileCandidates(
  terms: readonly string[],
  scope: DocScope | undefined,
): Promise<Passage[]> {
  const pattern = terms.map(escape).join("|");
  const roots = scope?.paths?.length ? scope.paths : [""];
  const files = new Set<string>();
  for (const path of roots) {
    const search = await fs.grep(pattern, {
      ...(path ? { path } : {}),
      glob: "*.md",
      caseInsensitive: true,
      maxMatches: 1000,
    });
    for (const hit of search.matches) files.add(hit.file);
    if (search.truncated) {
      // A bounded grep result is not the complete candidate set. A file scope needs no listing.
      if (path.endsWith(".md")) files.add(path);
      else {
        const entries = await fs.readdir(path || ".", {
          recursive: true,
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (
            typeof entry !== "string" &&
            entry._isFile &&
            !entry._isSymbolicLink &&
            entry.name.endsWith(".md")
          )
            files.add(entry.name);
        }
      }
    }
  }
  const candidates: Passage[] = [];
  for (const file of [...files].sort()) {
    const text = await readDocument(file);
    for (const section of sections(text))
      candidates.push({
        source: file,
        section: section.heading || file,
        text: section.text,
      });
  }
  return candidates;
}

async function catalogCandidates(terms: readonly string[]): Promise<Passage[]> {
  const hits = await docs.search(terms.join(" "));
  const entries = await Promise.all(hits.map((hit) => docs.describe(hit.id)));
  return entries.flatMap((entry) =>
    entry?.description
      ? [
          {
            source: `docs:${entry.id}`,
            section: entry.qualifiedName,
            text: entry.description,
          },
        ]
      : [],
  );
}

export default async function locateDoc(
  question: string,
  scope?: DocScope,
): Promise<Located> {
  const terms = keywords(question);
  if (terms.length === 0) return { found: [], tried: [] };
  const [files, catalog] = await Promise.all([
    fileCandidates(terms, scope),
    scope?.paths?.length ? Promise.resolve([]) : catalogCandidates(terms),
  ]);
  const candidates = rank(terms, [...files, ...catalog]);
  const answers: Found[] = [];
  const related: Found[] = [];
  const tried = new Set<string>();
  const batches = Array.from(
    { length: Math.ceil(candidates.length / BATCH) },
    (_, index) => candidates.slice(index * BATCH, (index + 1) * BATCH),
  );
  for (const batch of batches) {
    if (answers.length) break;
    const judgments = await Promise.all(
      batch.map((candidate) => fits(question, candidate.text)),
    );
    batch.forEach((candidate, index) => {
      tried.add(candidate.source);
      const fit = judgments[index];
      if (fit === "answers" || fit === "related")
        (fit === "answers" ? answers : related).push({
          source: candidate.source,
          section: candidate.section,
          quote: candidate.text,
          fit,
        });
    });
  }
  return {
    found: [...answers, ...related].slice(0, QUOTES),
    tried: [...tried],
  };
}
