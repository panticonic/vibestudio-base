# claimCheck: decomposition

`claimCheck(text, claims): { satisfied, verdicts }` says, for each required claim, whether a text states it, contradicts
it, or leaves it out, with the sentence of the text that shows it. It is the check "did this report say X" without a
regular expression: an agent checks its own answer against the facts the user asked for, and the system-test runner
judges the facts a test declares as `reportClaims` (`../../../../system-testing/.../report-claims.ts`, in the System
testing template).

| Part | Form | Why |
| --- | --- | --- |
| Settle a claim whose usual wording occurs | crisp: `claimCheck/matchedSpan.ts` | A claim may carry `match`, the regular expression a validator already used. A match is "states" with no model call, so a validator that switches keeps exactly the passes it had. |
| Is the claim said | its own function, `claimCheck/states.nl` (`readout: decision`, boolean) | One yes-or-no question per claim over the text: the shape that passes on the executor (`triageFailure/deliveredOutcome`). Never a pick among runtime-built rows, never writing. |
| If not, is its opposite said | its own function, `claimCheck/denies.nl` (`readout: decision`, boolean) | Asked only for a claim that is not stated; `true` is `contradicts`, `false` is `absent`. |
| Bound what the executor reads | crisp: `claimCheck/excerpt.ts` | The text whole up to 6000 characters; past that, the sentences that share most words with the claim, in text order. |
| Quote the evidence | crisp: `claimCheck/spans.ts`, `quoteFor.ts`, `overlap.ts` | The quote is an exact slice of the text: the matched sentence, or the sentence sharing the most content words with the claim. The model never writes a quote. No quote for `absent`. |
| Aggregate | crisp, in `claimCheck/check.ts` | `satisfied` is every claim `states`. Claims are judged in parallel. |

The model call is per claim, not per sentence: whether a fact is stated can depend on two sentences together.

## Measurement

See "Status" below.
