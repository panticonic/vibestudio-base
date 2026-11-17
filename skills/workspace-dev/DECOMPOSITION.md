# Workspace development: what is natural language and what is crisp

Ported sub-procedures: choosing a unit's identity icon, and diagnosing a panel that does not load. The proposed first whole-task port below uses the existing panel debug skill as its source.

## Whole-task port: repair a panel and prove the behavior

Source: [Panel Build, Debug, and Polish Loop](PANEL_DEBUG_LOOP.md) and the [workspace verification workflow](WORKFLOW.md#verify-the-requested-result). Start with an existing panel and a user request about its behavior. Run in a fresh managed Vibestudio workspace at a known source revision. Capture the teacher as it executes the Natlang root. Use the same Vibestudio services for subsequent runs so the browser and workspace respond to each run's own actions.

| Skill step | Natlang or crisp boundary | Evidence passed forward |
| --- | --- | --- |
| Understand the request and identify the panel | `repairPanel.nl` owns the user request. A callable `defineChecks.nl` derives observable behavior and any existing behavior to preserve. | Target panel, requested behavior, proposed checks. System-test validators remain separate. |
| Reproduce and inspect | `reproduce.nl` chooses an interaction from the rendered roles and names, then decides whether the observation establishes the issue. Host services open the context-pinned panel, inspect it, perform interactions and return receipts. | Panel identity, runtime generation, concrete reproduction and observations. |
| Diagnose | `diagnose.nl` chooses which distinct questions to delegate. Compiler, source and interaction investigations run only when the evidence calls for them. Reuse the exact load-diagnosis table for typed load failures. | Diagnosis with source and runtime evidence, plus unresolved questions. |
| Plan and apply a fix | `proposeRepair.nl` chooses the source change. The workspace service makes the exact edit at the reviewed working revision and returns the resulting revision. The build service reports diagnostics for that revision. | Proposed diff, applied revision and build result. |
| Verify and recover | `verifyRepair.nl` checks the built candidate through the original interaction and preservation checks. `repairPanel.nl` routes a build diagnostic, invalid observation, or still-failing interaction back to the relevant stage using the new evidence. | Build and browser receipts tied to the candidate revision. |
| Report the outcome | `repairPanel.nl` reports the verified result or a specific blocker. Host cleanup releases the panel/session and retires the test instance. | Final answer, changed files and verification receipts. |

The root proceeds over named state: (1) set `request`, `panel` and `checks`; (2) record `reproduction`; (3) choose an investigation using that evidence; (4) tie `change` and `build` to the working revision; (5) update `verification` from live interactions; (6) finish on verified behavior or explain the blocker. A retry needs a new observation or a new candidate with a reason. Repeating the same failed operation on the same revision with the same evidence is a blocker. Retain the panel handle across rebuilds and acquire current-generation evidence before accepting a probe.

Use the existing runtime and workspace-edit interfaces at the host boundary. Return serializable evidence to the program and keep live handles in the host. Preserve native image content where the backend can observe and capture it. A DOM-based test should exercise a behavioral requirement; visual quality needs actual screenshot evidence.

The first qualification task is preserving a panel draft across tab switches. Use distinct starting worlds where the draft is lost on unmount and where a stale snapshot overwrites it on return. The verifier exercises the switch and return, checks the draft, and checks that Save and Discard still work. A deliberately wrong fix that keeps stale data after Discard must fail. Group variants of the same underlying world together for data splits. Capture root decisions, child calls, tool effects and their results in trajectory IR, and measure success on the user outcome plus coverage of the decisions that led to it. Call count is a diagnostic; the program should take the work the evidence requires.

This section is the decomposition for the new port. The whole-task program and live collection are still to be implemented.

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
