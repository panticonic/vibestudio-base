import type { CitedBrief, ResearchFailure } from "../types.js";

/** Preserve checked evidence across source batches; no new claim is constructed here. */
export default function combineBriefs(question: string, briefs: CitedBrief[], failures: ResearchFailure[]): CitedBrief {
  const statements = [...new Map(briefs.flatMap(brief => brief.statements)
    .map(statement => [JSON.stringify(statement), statement])).values()];
  const notRead = [...new Map([...failures, ...briefs.flatMap(brief => brief.notRead)]
    .map(failure => [JSON.stringify(failure), failure])).values()];
  return { question, status: statements.length ? "answered" : "insufficient", statements, notRead,
    rejected: briefs.reduce((total, brief) => total + brief.rejected, 0) };
}
