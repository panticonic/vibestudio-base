# Messaging: what is natural language and what is crisp

Ported sub-procedure: choosing the alert rung of a `notify` call. Sending stays with the agent (an interrupting notification is a consequential effect); the function returns the rung as a proposal.

| Part | Form | Why |
| --- | --- | --- |
| none, inbox, or interrupt for a message | own function, `alertRung`, `readout: decision` | A three-way finite choice that depends on meaning ("something they would want to be pulled away from"). Scored by exact match, with the probability vector available to a caller that wants a floor. |
| Recipient kind (channel, person, supervisor, subagent, other agent) | an argument | The agent knows who it is addressing; deriving it from prose would add a place to be wrong. Rule one of the function is then exact. |
| The user's or recipient's stated preference | an argument (`stated_preference`), read by one instruction | Free text the program cannot enumerate; the instruction says what it overrides. |
| Resolving a name to an addressee ref | not a natlang function | Lexical matching makes no model call, so it is plain code in the skill (`../resolve-addressee.ts`). The send itself stays agent-side. |
| Whether to send at all (etiquette: notable events only) | stays in the skill text | A judgment about the whole conversation, not about one message. |

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (alertRung 8/6/6).

Status: **not met on the spot checks; stays agent-executed.**

Spot checks (validation, 2 of 6 cases scored): `disk-full` correct (interrupt, p=0.9998); `weekly-report` wrong (answered `none` with p=0.9999 although the recipient is a person; expected `inbox`). Two cases are not a gate result, but a confident miss on rule 1's boundary says the instructions need rework and a 48-sample model-facing measurement before this ships.

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
