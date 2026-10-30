# Templates: what is natural language and what is crisp

Ported sub-procedures: the errors-and-remedies lookup, and a template summary. Selected-file transfer, publication, and workspace creation stay with the agent and their approval flows.

| Part | Form | Why |
| --- | --- | --- |
| Error text to remedy (connect a credential, stop on integrity, retry later, re-inspect authoring, fix a dependency, check the publication outcome, unrecognized) | own function, `templateRemedy`, `readout: decision` | The templates extension throws plain `Error`s with prose messages (only the credential error carries a code), so classification is interpretation of text. Finite outcome, scored by exact match. The remedy text itself stays in `references/errors-and-remedies.md`: it is documentation the agent reads when the label says which row applies. |
| What kind of template an inspection describes (base, personal, system, development, catalog) | own function, `templateRole`, `readout: decision` | Judged from what the repositories are and what the template depends on. |
| Name, description, commit, dependency URLs, repository counts per folder | crisp helper `summarize` | Read directly from the inspection; counting is exact. |
| One-sentence prose summary | not ported | An open-ended sentence has no exact scorer; the typed summary carries what a decision needs. |
| Whether private source needs credentials; integrity and manifest validation | the extension | Exact checks that already exist. The remedy "stop, show the details, don't substitute another source" is stated by `stop-integrity`. |

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (templateRemedy 8/7/7, summarizeTemplate 6/4/4).

Status: **not measured to a gate; both functions stay agent-executed. `summarize` (the crisp part) is unit-tested in `summarize.test.ts`.**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
