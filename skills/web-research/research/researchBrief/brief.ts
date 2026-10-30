/**
 * The fixed sequence of a brief: read the pages, find the evidence window by window, write the answer from the
 * verified claims, attach each statement's citations. The model reads and writes; every check is exact.
 */
import gather from "./gather.js";
import findEvidence from "./findEvidence.nl";
import writeBrief from "./writeBrief.nl";
import {
  checkedEvidence,
  checkedStatements,
  statedDate,
  windows,
} from "./verify.js";
import type { Citation, CitedBrief, Claim } from "../types.js";

export default async function researchBrief(
  question: string,
  sources: string[],
): Promise<CitedBrief> {
  const retrieved = new Date().toISOString().slice(0, 10);
  const { pages, notRead } = await gather(question, sources);
  let rejected = 0;
  const evidence: { claim: string; citation: Citation }[] = [];
  for (const page of pages) {
    const published = statedDate(page.text);
    const found = await Promise.all(
      windows(page.text).map((text) =>
        findEvidence(question, { url: page.url, title: page.title, text }),
      ),
    );
    const proposed = found.flat();
    const checked = checkedEvidence(proposed, page.text);
    rejected += proposed.length - checked.length;
    for (const item of checked)
      evidence.push({
        claim: item.claim.trim(),
        citation: {
          url: page.url,
          title: page.title,
          retrieved,
          published,
          quote: item.quote.trim(),
        },
      });
  }
  if (evidence.length === 0)
    return {
      question,
      status: "insufficient",
      statements: [],
      notRead,
      rejected,
    };
  const claims: Claim[] = evidence.map((item, index) => ({
    id: index + 1,
    claim: item.claim,
  }));
  const written = await writeBrief(question, claims);
  const statements = checkedStatements(
    written,
    new Map(claims.map((claim) => [claim.id, claim.claim])),
  );
  rejected += written.length - statements.length;
  if (statements.length === 0)
    return {
      question,
      status: "insufficient",
      statements: [],
      notRead,
      rejected,
    };
  return {
    question,
    status: "answered",
    statements: statements.map((statement) => ({
      text: statement.text.trim(),
      cites: statement.cites.map((id) => evidence[id - 1]!.citation),
    })),
    notRead,
    rejected,
  };
}
