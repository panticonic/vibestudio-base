# Workspace development: what is natural language and what is crisp

Ported sub-procedures: choosing a unit's identity icon, and diagnosing a panel that does not load. Scaffolding, forking, dependency policy, and the debug loop stay agent skills (open-ended coding).

| Part | Form | Why |
| --- | --- | --- |
| Whether a unit shows a brand mark, a Lucide object, or an emoji, and which one | own function, `iconIntent`, typed `{ family, term }` (in `natlang/`) | The icons guide gives an ordered choice (brand of a technology it implements, a concrete Lucide object for a concept, an emoji only when it says more). Naming a Lucide icon is open-ended, so it is a typed reading, not a decision readout. |
| Whether the name exists, and the nearest real names when it does not | crisp, `resolveIcon` over the caller's `fs` | The catalog is 2,000 files plus eight brand marks: exact lookup, with the words of a near-miss turned into real candidates in the error. The model never has to remember the catalog; `setUnitIcon` and `prepareUnitIcon` check again at the authoring edge. |
| Emoji validity | crisp (`Intl.Segmenter`, one grapheme, pictographic) | Exact. |
| Panel load diagnosis from `observe()` / `diagnose()` | **crisp** table, `diagnosePanelLoad` | The evidence is typed: `phase`, `failure.code`, `failure.stage`, `host.reachable`. PANEL_API.md says to read `failure.code` instead of matching message text, and each code names one layer and one escalation. The table is exhaustive over `PanelFailureCode`, so a new code does not compile until it has a route. No interpretation is left for a model. |
| Repairing the source once the layer is known | stays an agent procedure | Open-ended coding. |

The icon program lives in `natlang/` because the skill directory holds large unrelated TypeScript. `diagnosePanelLoad` has no executor baseline: it makes no model call.

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.8 (half for the family, half for an accepted catalog id) on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (unitIcon 8/4/5).

Status: **`diagnosePanelLoad`: crisp, no executor, exhaustive table plus `diagnose-panel-load.test.ts` (ported). `unitIcon`: not measured to a gate; stays agent-executed (`catalog.test.ts` covers the crisp lookup).**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
