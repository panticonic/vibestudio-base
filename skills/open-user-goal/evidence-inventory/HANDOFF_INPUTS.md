# Handoff intent and native evidence inputs

The complete candidate inventory is `handoff-inputs.json`: 48 joint Base callables
selected by should/handoff/complete/finish/stage in their names, with source hashes,
argument declarations and reviewed roles. It includes the domain entrypoints,
pure judgments, completion compositions and native effect/readback adapters.
It is an input-flow review, not a claim that every task outcome is qualified.

| Pure judgment | Evidence supplied | Finding |
| --- | --- | --- |
| `workOnEvalHandoffGoal/shouldStageEvalResult.nl:4` | Originally only goal and action/run-ID decision | Confirmed defect: native original receipt and independent readback were dropped. Now receives `ConfirmedEvalResult`, selected from the actual trials. |
| `workOnProgramRunGoal/shouldSignOutput.nl:4` | Goal, actual program, complete native output receipt, runtime review | Native output/authorization/verification evidence is present. |
| `workOnAssemblyGoal/shouldStageAssemblyDraft.nl:4` | Goal, grant, actual plan including head and build receipts | Native revision/build evidence is present in `open-workspace-assembly/types.ts:16`. |
| `workOnCapabilityGoal/shouldStageCapabilityPlan.nl:4` | Goal, grant, actual plan with source revision, method hashes and knowledge citations | The original structured plan evidence is present in `open-doc-plan/types.ts:25`. |
| `workOnAuthoringGoal/decideHandoff.nl:4` | Goal and native authoring receipt with selection and full review | Original review is preserved in `open-authoring-goal/types.ts:31`. |
| `workOnApiReadinessGoal/decideApiReadiness.nl:4` | Selection frontier/witness, actual review and quiet audit | No missing-input defect: parent `workOnApiReadinessGoal.nl:9` explicitly obtains metadata-only audit. Wave0032 omitted it, so staging correctly refused the incomplete report. |

Other handoff judgments retain full domain evidence: provider approval + delivery
+ original output; specialist receipt join + original artifact + history; image
original reads + assessment; editorial opening/current snapshots + sources/edit;
news reader/archive/source findings; dictation current frontier + witness. Native
stage adapters forward original identities/values to writers, rather than asking
an isolated lambda to establish facts it was never given. Completion adapters
retain the actual observation/result or obtain an authoritative native readback.

`confirmedEvalResult.ts` joins a use decision to its actual retained trial. It
requires approved original scope, matching run identity/lifecycle, matched native
journal and confirmed independent byte readback. It keeps the original objects
and their distinct run/result/content hash layers; it does not synthesize a
status-only proof or equate receipt hashes with file-content hashes. Repeated
consistent observations are allowed; contradictory immutable receipts are not.

The intent lambda decides whether the user wants a private handoff of that value.
It does not reconfirm missing facts from a decision tag. The external scratch
writer still checks current authority and exact original native receipts before
writing, and the independent task verifier still reads the resulting bytes.
The four real outcome misses from wave0032 remain failures, with original data
retained; this library correction does not relabel them as completed goals.
