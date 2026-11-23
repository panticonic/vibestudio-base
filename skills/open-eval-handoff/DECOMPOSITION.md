# Open native eval recovery and handoff

`workspace-live-eval-recovery` validates a specific original run's immutable
operation journal and scoped blob readback. `eval-lifecycle` exercises the
owner-scoped start, cancellation, terminal observation and replay surfaces.
`workspace-scratch-handoff` binds a staged artifact to independent readback.
The new open entry composes these mechanisms after discovering the job and
its available original attempts from owned workspace records.

- `workOnEvalHandoffGoal` and companion lambdas resolve the job and relevant
  attempts, retain separate lifecycle and effect findings, choose a valid
  prior result or a current result, schedule an authorized exact retry when
  justified, and decide whether the user asked for a scratch artifact.
- `reviewEvalRecovery` retains its native journal assessment and exact
  readback. `bindEvalRecovery` supplies evidence from the immutable terminal
  receipt. Cancellation, missing receipts and unverified or truncated state
  survive as evidence. A parked cell can be cancelled through the real
  owner-scoped EvalDO handle. It cannot prove the effect committed solely
  because bytes exist. A matched native store and separate scoped content
  readback are required to carry a result.
- `retryOpenEval` starts one new finite EvalDO only for caller-owned exact
  retry authority, a known absent commit, and the observed original attempt.
  Finished original receipts replay under the same admission identity. A new
  authorized attempt has a different identity. No model code enters EvalDO.
- `stageEvalHandoff` uses the workspace scratch writer to persist the exact
  confirmed text with its original admission and result digests. The judge
  independently rereads native storage, original receipts and scratch bytes.
  Private verifier outcomes and replay controls stay in System Testing.

## Preserve confirmation through intent composition

The staging decision previously received only goal plus `{action,runId}`, while
its instructions required native confirmation. The verified original trial was
lost between the recovery decision and staging intent. `confirmedEvalResult`
now joins the selection to the original observation and review, validates their
run/lifecycle/journal/readback identities, and preserves their actual values.
`shouldStageEvalResult` consumes that confirmed result and interprets only the
user's handoff request. The native writer remains the current authority and byte
receipt boundary. Joint-library input inventory is recorded in
`../open-user-goal/evidence-inventory/HANDOFF_INPUTS.md` and its hashed JSON.
