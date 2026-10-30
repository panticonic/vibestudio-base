/** The fixed sequence of the draft: redact, read facts, assemble. No step needs a model. */
import redact from "./redact.js";
import facts from "./facts.js";
import assemble from "./assemble.js";
import type { Draft, Evidence } from "../types.js";

export default async function collect(evidence: Evidence): Promise<Draft> {
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
  return assemble(safe, await facts(safe), removed);
}
