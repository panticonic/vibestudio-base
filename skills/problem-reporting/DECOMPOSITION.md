# Decomposition: judging and drafting problem reports

Two functions. The old skill is prose for the agent: do not report errors in the user's own code, expected refusals or a
single transient failure; prepare a report for a real platform defect; write a narrative whose claims are marked
`observed`, `inferred` or `unverified`; never include secrets; leave sending to the user's approval.

Both were measured on the executor before this shape was settled. Neither natural-language step is in the shipped path.

## `classifyDefect(evidence): DefectClass` (`classifyDefect.nl`): stays agent-executed

| Part | Decision | Why |
|---|---|---|
| Is this a platform defect, the user's own code, an expected refusal or a transient failure | own function, `readout: decision` | It is the skill's central policy and a finite result, so it is one scoring pass, cheap, and scoreable. The definitions of the four classes are the skill's own sentences. **Measured at the gate on validation and one case below it on test; kept as a measured candidate, not called by `SKILL.md`.** |
| What counts as evidence | crisp type `Evidence` | `goal`, `observed`, `expected`, `operation`, `attempts`, `reproduced`. The agent fills it; the function reads it. |
| Whether to report | stays with the agent | Only `platform` is a defect to report; a user who explicitly asks to report their own code's problem is a request the function cannot see. |

## `draftProblemReport(evidence): Draft` (`draftProblemReport.nl`)

| Part | Decision | Why |
|---|---|---|
| Remove secrets (bearer tokens, API keys, GitHub and Slack tokens, JWTs, `password=...`), URL query strings and userinfo, home paths | crisp, `draftProblemReport/redact.ts` | The report rules are exact; a small model must not be the last line of defense for credentials. It runs before anything is laid out and records what it removed. |
| Read the destination (`problemReports.availability`) and, when evidence names an invocation, one bounded diagnostic (`gad.diagnoseInvocation`: 20 events, 20 commands, 50 effects) | crisp, `draftProblemReport/facts.ts` | The outside world. A diagnostic that is denied or missing becomes a recorded gap with the reason, as the skill says ("mark evidence that is missing, denied, expired as incomplete"). |
| Lay the account out as narrative sections, with a claim for each | crisp, `draftProblemReport/assemble.ts` | **Tried as a model-written narrative and removed.** The sections are the user's own words (goal, observed, expected, attempts) and the platform's diagnostic; rewording them added nothing and cost the one thing the skill asks for, exact quotation. The claims rule is exact over `evidence.reproduced`: the user's account is `unverified` until the agent reproduced it; what the program read from the platform is `observed`. |
| `operation` token | crisp, `assemble.ts` | Copied from the evidence when it matches the token pattern, else null. A product identifier is never invented or rewritten by a model. |
| `category`, `component`, `kind` | stays with the agent | Judgments about the product, chosen from the `problemReports` enums when the report is created. A guessed value would be stored as fact. |
| Narrative size | crisp, `assemble.ts` | Over 128 KiB it throws; "never silently shorten the user's narrative". |
| Save the draft, `prepare`, `send` | stay with the agent | The effects rule: the function returns a proposal. Saving is `problemReports.create`/`appendNarrative` by the agent; `send` pauses for the one-time approval. The natlang service exposes `problemReports` read-only. |

## Suite

One suite (`suite.ts`) and one case file (`cases.jsonl`); each case names the function it exercises.

- `classifyDefect`: 18 cases (10 train, 4 validation, 4 test). Evidence from the skill's own examples, the system test
  prompts (`tests/problem-reporting.ts`), `DIAGNOSTICS.md` invariants, and common runtime errors. Gates per case: `exact`,
  and `noFalsePlatform` (a false platform report is the error this function exists to prevent).
- `draftProblemReport`: 14 cases (6 train, 4 validation, 4 test), with secrets, home paths, a Windows path, a denied
  diagnostic, an invalid operation token. Quality is the fraction of the user's facts present; gates are `noSecrets`,
  `claims`, `shape` (goal and symptom sections) and `operation`.

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12068), CPU, decision readouts scored (`sessionDriver`), run
in-process with the suite's own cases, fixture and scorer. Gates: `classifyDefect` accuracy of at least 0.85 on validation
and on the locked test split with no false `platform`; `draftProblemReport` every gate on every case.

| Function | Split | Result | Gate |
|---|---|---|---|
| `classifyDefect` | validation (4) | 0.50 (also through `pnpm natlang:eval`); a user-code `ReferenceError` and a dismissed approval both read as `platform` | not met |
| | test (4) | 0.25 (`pnpm natlang:eval`): 3 of 4 wrong, including a `SyntaxError` in a user's worker and a path-escape refusal | not met |
| `classifyDefect`, rules in first-match order (written against the train split) | train (first 8 of 10) | 3 of 8 | not met |
| | two cases, options reordered | the answer follows the order of the options. With `platform` first it won on both (probability 1.0 on a plain `TypeError`, 0.996 on a denied push). With `user-code` first the same `TypeError` is `user-code` at 0.999 and the denied push is `user-code` at 0.81. With `refusal`, `transient`, `user-code`, `platform` the `TypeError` is `transient` at 0.993 | |
| `classifyDefect`, the readout scores the object the model answers in (natlang `ee9bb0b22`, measured at `ceb346744`, the same code: the stock model is asked for `{"result": VALUE}`, not a bare JSON string) | validation (4) | **1.00**, 4 of 4 (`pnpm natlang:eval`), no false `platform` | met |
| | test (4), run once | **0.75**, 3 of 4: a refusal, `fs.readText refused: path escapes the context root`, read as `platform` (0.88; `refusal` 0.12), which is also the one false `platform`. The other three exact | not met (gate 0.85, no false `platform`) |
| | `todo-map-undefined` (a train case), the options listed in four orders | `user-code` in three of four (1.00, 1.00, 0.57; 0.29 when listed last); with the bare reply the winner followed the listing | |
| `draftProblemReport`, model-written narrative | validation (4) | not finished: the first case ran 35 minutes (8 turns of up to 1024 tokens at 6-8 tokens/s) and was stopped | not met |
| `draftProblemReport`, crisp (this version) | validation (4), test (4) | quality 1.00, every gate on every case (`pnpm natlang:eval`); no model call | met |

The first measurement of `classifyDefect` was not a measurement of the model's judgment. The readout scored the bare reply `"platform"`,
which the stock model gives about e^-15 of the time (it writes `{"result": "platform"}` or opens a tool call), so the four options
were compared where all of them were about e^-35 improbable and the winner was whichever was listed first or tokenized as `"` +
word. The scores themselves were exact (checked token by token against the server's `/completion`). natlang now asks for and scores
`{"result": VALUE}` from a managed stock model (`plans/MODEL_FACING_CHANGES.md`, 2026-11-13): validation 0.50 -> 1.00 and test
0.25 -> 0.75 on the same cases. What remains is one case (a refusal about a path read as a platform error), which is a judgment the
model gets wrong in three of four listings, not a position effect; the function stays a measured candidate that `SKILL.md` does
not call. Its labels were written by the author; the 18 cases seed adaptation or tuning if the executor changes.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The labels were
written by the author from the skill text and the system test prompts.
