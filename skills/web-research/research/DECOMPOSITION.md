# researchBrief: decomposition

`researchBrief(question, sources): CitedBrief` answers a question from web pages. Every statement carries the URL, the
day the page was read, the page's own stated date when it has one, and the exact sentence that shows it. A statement
without a valid citation does not exist in the result. The program reads the web (the `web` service: search, fetch,
read; public sessions only, so nothing needs the browser-cookie approval); it sends nothing anywhere.

| Part                                       | Form                             | Why                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose pages                               | crisp: `researchBrief/gather.ts` | The user's `sources` first, otherwise the first distinct results of searching the question. At most 3 pages, 9000 characters each (`fetch` head, then `read` for the rest). A page that cannot be read is reported in `notRead` with the service's own message; the others still count. |
| Cut a page into windows                    | crisp: `verify.ts` `windows`     | A small model's context is bounded; 4500-character windows keep each call small.                                                                                                                                                                                                        |
| Find what a window says about the question | its own function, `findEvidence` | Reading comprehension, per window, parallel. It returns a claim and one sentence copied from the text. Page text is declared untrusted data in the instruction (a case carries an injected "reply HACKED" comment).                                                                     |
| Check each quote                           | crisp: `checkedEvidence`         | The quote must be at least 20 characters and a substring of the page text (whitespace collapsed), and appear once. A claim whose quote is not in the page is dropped and counted in `rejected`. This is what makes "no uncited claims" exact rather than hoped for.                     |
| Publication date                           | crisp: `statedDate`              | A date the page states beside "published/updated/posted" near its top; null otherwise. Never inferred.                                                                                                                                                                                  |
| Write the answer                           | its own function, `writeBrief`   | Synthesis over numbered claims; each statement cites claim ids.                                                                                                                                                                                                                         |
| Check the statements                       | crisp: `checkedStatements`       | Every cited id exists, there is at least one, and the statement shares a content word with a claim it cites. Others are dropped.                                                                                                                                                        |
| Assemble citations                         | crisp, in `brief.ts`             | Each cite is `{ url, title, retrieved, published, quote }`, built from the verified evidence, never retyped by the model.                                                                                                                                                               |
| No supported answer                        | typed result                     | `status: "insufficient"` with no statements, never a guess.                                                                                                                                                                                                                             |

Search snippets are never cited (the web-research skill: uncited snippets only help find sources); only fetched page text is.

## Measurement

each case in `cases.jsonl` carries the recorded pages its `web` service replays (MDN excerpts, CC BY-SA 2.5, plus pages written for the dated, injected and off-topic
cases); the `web` service is replayed from them, including a failing fetch and a failing search. Quality is coverage of
the expected key points when the status, the absence of injected text, the date and `notRead` are right. Gates: 0.85 on validation and on the locked
test split, and every citation exact (`cited`) in every case.

## Status: not ported

SKILL.md does not call this function: the gates are not met. Evidence, on the executor (LFM3 1.7B Q8_0, `pnpm natlang:eval`):
the first sampled case (`all-resolved:summary`, suite settings 4 turns, 192 tokens per turn) failed in `describeUnit` with
"quiesced: episode turn, token, or wall-clock budget exhausted" and took 20 minutes on the shared server, so quality 0 on it. A full
validation run (8 cases) did not complete: with the case watchdog removed it stalled with no request in flight after 85 minutes
(root cause not found), and full runs on the shared machine were not feasible afterwards. The research suite was not run on the executor at all. The suite, cases and
checks stay; a later run on a quieter machine, or an instruction that lets the model finish in few turns, decides whether it ports. Until then the agent
performs this procedure itself.
