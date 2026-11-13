# Decomposition: judging a failure

One function. The skill is prose for the agent: do not report errors in the user's own code, expected refusals or a
single transient failure; prepare a report for a real platform defect. Judging whose problem a failure is a judgment over
meaning, so it is the one natural-language step here. The exact drafting of a report (`draftProblemReport`) makes no model
call, so it is plain code in the skill (`../draft-problem-report.ts`), not a natlang program.

It was measured on the executor before this shape was settled. The step is not in the shipped path.

## `classifyDefect(evidence): DefectClass` (`classifyDefect.nl`): stays agent-executed

| Part | Decision | Why |
|---|---|---|
| Is this a platform defect, the user's own code, an expected refusal or a transient failure | own function, `readout: decision` | It is the skill's central policy and a finite result, so it is one scoring pass, cheap, and scoreable. The definitions of the four classes are the skill's own sentences. **Measured at the gate on validation and one case below it on test; kept as a measured candidate, not called by `SKILL.md`.** |
| What counts as evidence | crisp type `Evidence` | `goal`, `observed`, `expected`, `operation`, `attempts`, `reproduced`. The agent fills it; the function reads it. |
| Whether to report | stays with the agent | Only `platform` is a defect to report; a user who explicitly asks to report their own code's problem is a request the function cannot see. |

## Suite

One suite (`suite.ts`) and one case file (`cases.jsonl`): 18 cases (10 train, 4 validation, 4 test). Evidence from the
skill's own examples, the system test prompts (`tests/problem-reporting.ts`), `DIAGNOSTICS.md` invariants, and common
runtime errors. Gates per case: `exact`, and `noFalsePlatform` (a false platform report is the error this function exists
to prevent).

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12068), CPU, decision readouts scored (`sessionDriver`), run
in-process with the suite's own cases, fixture and scorer. Gate: accuracy of at least 0.85 on validation and on the
locked test split with no false `platform`.

| Function | Split | Result | Gate |
|---|---|---|---|
| `classifyDefect` | validation (4) | 0.50 (also through `pnpm natlang:eval`); a user-code `ReferenceError` and a dismissed approval both read as `platform` | not met |
| | test (4) | 0.25 (`pnpm natlang:eval`): 3 of 4 wrong, including a `SyntaxError` in a user's worker and a path-escape refusal | not met |
| `classifyDefect`, rules in first-match order (written against the train split) | train (first 8 of 10) | 3 of 8 | not met |
| | two cases, options reordered | the answer follows the order of the options. With `platform` first it won on both (probability 1.0 on a plain `TypeError`, 0.996 on a denied push). With `user-code` first the same `TypeError` is `user-code` at 0.999 and the denied push is `user-code` at 0.81. With `refusal`, `transient`, `user-code`, `platform` the `TypeError` is `transient` at 0.993 | |
| `classifyDefect`, the readout scores the object the model answers in (natlang `ee9bb0b22`, measured at `ceb346744`, the same code: the stock model is asked for `{"result": VALUE}`, not a bare JSON string) | validation (4) | **1.00**, 4 of 4 (`pnpm natlang:eval`), no false `platform` | met |
| | test (4), run once | **0.75**, 3 of 4: a refusal, `fs.readText refused: path escapes the context root`, read as `platform` (0.88; `refusal` 0.12), which is also the one false `platform`. The other three exact | not met (gate 0.85, no false `platform`) |
| | `todo-map-undefined` (a train case), the options listed in four orders | `user-code` in three of four (1.00, 1.00, 0.57; 0.29 when listed last); with the bare reply the winner followed the listing | |

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
