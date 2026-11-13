/**
 * Propose a problem report for a failure or poor result, from the evidence the agent already has: read the platform
 * facts, lay the account out. Exact code, no model. Nothing is saved or sent. It does not redact: `problemReports.prepare`
 * is the one place secrets, URL query strings and home paths are removed, before any preview, download or send.
 */
import { assembleDraft } from "./draft-assemble.js";
import { readDraftFacts } from "./draft-facts.js";
import type { Draft, Evidence } from "./types.js";

/**
 * Fetches one bounded diagnostic when the evidence names an invocation, and lays the account out as narrative sections.
 */
export async function draftProblemReport(evidence: Evidence): Promise<Draft> {
  return assembleDraft(evidence, await readDraftFacts(evidence));
}
