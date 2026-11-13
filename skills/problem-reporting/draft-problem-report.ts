/**
 * Propose a problem report for a failure or poor result, from the evidence the agent already has: redact, read the
 * platform facts, lay the account out. Exact code, no model. Nothing is saved or sent.
 */
import { assembleDraft } from "./draft-assemble.js";
import { readDraftFacts } from "./draft-facts.js";
import { redact } from "./draft-redact.js";
import type { Draft, Evidence } from "./types.js";

/**
 * Removes secrets, URL query strings and home paths from the evidence, fetches one bounded diagnostic when the evidence
 * names an invocation, and lays the account out as narrative sections.
 */
export async function draftProblemReport(evidence: Evidence): Promise<Draft> {
  const removed: string[] = [];
  const clean = (text: string) => {
    const result = redact(text);
    for (const name of result.removed) if (!removed.includes(name)) removed.push(name);
    return result.text;
  };
  const safe: Evidence = {
    ...evidence,
    goal: clean(evidence.goal),
    observed: clean(evidence.observed),
    expected: clean(evidence.expected),
    attempts: clean(evidence.attempts),
  };
  return assembleDraft(safe, await readDraftFacts(safe), removed);
}
