/** Check claims against a text: a claim's own pattern settles it when it occurs; the executor judges the rest; quotes are exact. */
import states from "./states.nl";
import denies from "./denies.nl";
import excerpt from "./excerpt.js";
import matchedSpan from "./matchedSpan.js";
import quoteFor from "./quoteFor.js";
import type { Claim, ClaimCheck, ClaimResult, ClaimVerdict } from "../types.js";

async function judge(text: string, claim: Claim): Promise<ClaimResult> {
  if (claim.match !== undefined) {
    const matched = matchedSpan(text, claim.match);
    if (matched !== null) return { id: claim.id, verdict: "states", quote: matched, by: "match" };
  }
  // Two yes-or-no questions: is it said; if not, is its opposite said.
  const read = excerpt(text, claim.claim);
  const answer: ClaimVerdict = (await states(read, claim.claim))
    ? "states"
    : (await denies(read, claim.claim))
      ? "contradicts"
      : "absent";
  const quote = answer === "absent" ? null : quoteFor(text, claim.claim);
  return { id: claim.id, verdict: answer, ...(quote !== null ? { quote } : {}), by: "model" };
}

export default async function check(text: string, claims: Claim[]): Promise<ClaimCheck> {
  const verdicts = await Promise.all(claims.map((claim) => judge(text, claim)));
  return { satisfied: verdicts.every((result) => result.verdict === "states"), verdicts };
}
