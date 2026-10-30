# Visualize: what is natural language and what is crisp

Ported sub-procedures: choosing a response component for an answer, and reading data into the props of one component.

| Part | Form | Why |
| --- | --- | --- |
| Which component (or none) shows this answer | own function, `chooseComponent`, `readout: decision` | The "Choosing components" table and the "skip visuals" list as eleven ordered rules over a description of the data and of the ask. Finite, scored by exact match. ActionButton is folded into Choices (the table offers them interchangeably for "decide where to go next"). |
| Reading the facts into props for Chart, Stats, Compare, Timeline, Checklist, PlaceMap, Choices | own function, `readProps`, typed `ComponentSpec` | Extraction of meaning into typed structure. The return type is a discriminated union, so natlang's own result check rejects a wrong shape before any crisp code runs. |
| Strict validation (no unknown props, enums, required fields, same keys in every chart row, numbers plottable, coordinates in range, `Choices` id a slug) and the MDX tag | crisp `renderComponent` | The skill says an invalid prop set shows the user a notice. Exactness belongs in code, and the MDX is written in one place so no message ships a tag the component rejects. Errors name the fix. |
| Calculator (its `compute` function) and one-off components | not ported | Authoring code, not extraction. The agent writes it (kept as an agent skill). |
| Prose around the components, caveats, sources | stays with the agent | Open-ended writing. |

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 (chooseComponent accuracy; componentProps mean prop coverage with every case rendering) on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (chooseComponent 8/7/7, componentProps 6/4/4).

Status: **not measured to a gate; both functions stay agent-executed. `renderComponent` (the strict crisp part) is unit-tested in `render.test.ts`.**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
