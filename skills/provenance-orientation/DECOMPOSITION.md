# Provenance orientation: what is natural language and what is crisp

Ported sub-procedure: picking the mechanism for a provenance question (the table "Pick the mechanism for your question").

| Part | Form | Why |
| --- | --- | --- |
| Question to mechanism | own function, `provenanceMechanism`, `readout: decision` | Ten finite outcomes chosen from the wording of a question; the table is already ordered by what each question asks. Scored by exact match. The call itself (`provenance({ target, walk })`) is a one-line template the agent already has in the skill. |
| Inferring the underlying constraint from cause, cohort and rejections | stays an agent procedure | Open-ended reasoning over returned evidence, including the warning not to dismiss a rejection because its subject differs. It needs the frontier model. |
| Interpreting evidence narrowly (stated, trigger, mechanical) | stays in the skill text | Judgment about what a record permits the agent to claim. |

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (provenanceMechanism 9/7/8).

Status: **not measured to a gate; stays agent-executed.**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
