/** Build the draft from the redacted evidence and the facts read from the platform. Every word is the user's or the platform's. */
import type { Draft, DraftSection, Evidence, Facts } from "../types.js";

/** The narrative budget of a report, counted in UTF-8 bytes, separately from evidence and attachments. */
const NARRATIVE_LIMIT_BYTES = 128 * 1024;
const OPERATION_TOKEN = /^[A-Za-z0-9_.:@/-]+$/;
const SYMPTOM_CUT = 280;

export default function assemble(evidence: Evidence, facts: Facts, redactions: string[]): Draft {
  // The user's account is unverified until the agent reproduced it; what the program read from the platform is observed.
  const account = evidence.reproduced ? "observed" : "unverified";
  const sections: DraftSection[] = [
    { section: "goal", claims: "unverified", markdown: evidence.goal },
    { section: "symptom", claims: account, markdown: evidence.observed },
  ];
  if (evidence.expected.trim()) {
    sections.push({ section: "expected", claims: "unverified", markdown: evidence.expected });
  }
  if (evidence.attempts.trim()) {
    sections.push({ section: "attempts", claims: account, markdown: evidence.attempts });
  }
  if (facts.diagnostic) {
    sections.push({ section: "findings", claims: "observed", markdown: facts.diagnostic });
  }
  const bytes = new TextEncoder().encode(
    sections.map((section) => section.markdown).join("\n")
  ).length;
  if (bytes > NARRATIVE_LIMIT_BYTES) {
    throw new Error(
      `the narrative is ${bytes} bytes, over the ${NARRATIVE_LIMIT_BYTES} byte limit; a report is never silently shortened, so ask the user which sections to cut`
    );
  }
  const operation =
    evidence.operation && OPERATION_TOKEN.test(evidence.operation) ? evidence.operation : null;
  const gaps = [...facts.gaps];
  if (!evidence.reproduced) gaps.push("not reproduced: the report records the account as given");
  if (!operation) gaps.push("operation unknown");
  if (redactions.length) gaps.push(`removed before drafting: ${redactions.join(", ")}`);
  return {
    problem: {
      operation,
      symptom: evidence.observed.slice(0, SYMPTOM_CUT),
      expected: evidence.expected,
    },
    narrative: sections,
    gaps,
    destination: facts.destination,
    narrativeLimitBytes: NARRATIVE_LIMIT_BYTES,
  };
}
