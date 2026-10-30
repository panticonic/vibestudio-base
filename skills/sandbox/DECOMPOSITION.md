# Sandbox: what is natural language and what is crisp

Ported sub-procedure: choosing an interaction surface (INTERACTION_PATTERNS.md). The rest of the sandbox skill is reference for authoring UI and stays an agent skill.

| Part | Form | Why |
| --- | --- | --- |
| Which surface (eval, ask_user, feedback_form, inline_ui, feedback_custom, load_action_bar, choices, mdx) fits a need | own function, `interactionSurface`, `readout: decision` | Eight finite outcomes. The deciding facts are whether the agent can continue without an answer, whether one answer or several are needed, and whether a component can perform the operation itself; each is a sentence in the rule that applies. |
| Authoring the UI (INLINE_UI.md, ACTION_BAR.md, CUSTOM_MESSAGES.md) | stays an agent skill | Open-ended coding. |
| Eval API, runtime clients | stays reference | Generated surface documentation, not a procedure. |

The program lives in `natlang/` because the skill directory holds unrelated TSX references that a program root would otherwise compile.

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (interactionSurface 8/7/8).

Status: **not measured to a gate; stays agent-executed.**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.
