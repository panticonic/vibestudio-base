# Compound native recovery and operational scratch handoff

| Decision or mechanism | Representation |
| --- | --- |
| Decide whether the user needs a new recipient-ready operating note, and when | `runUserGoal.nl` chooses the compound route and `workOnRecoveryHandoff.nl` decides whether to compose two real installed programs. It keeps the original request and reports both actual branch outcomes. |
| Resolve native work identity, current versus approved fallback, and limited replay | The existing `workOnEvalHandoffGoal.nl` hierarchy invokes the installed Eval catalog, journal and recovery lambdas. Existing mechanisms independently bind retained EvalDO identities, journal and blob readback. |
| Protect recipient, current directive revision, missing sources and release state | Typed Natlang bridge entry reads the exact retained directive. The native mechanism operates on its private owned filesystem and validates that staged sources match the exact observed Eval result, current directive revision and permitted local recipient. |
| Analyze and assemble an operational note from verified native output and independent approved source text | Invoke installed typed `scratch-handoff.assembleHandoff` and its own hierarchy for collection, evidence selection, preparation and durable scratch write. |
| Verify complete outcomes in the actual workspace | System Testing rereads Eval original identity and blob, directive and source bytes independently, plus scratch output set and exact evidence line union. Check no saved note for held, unanswered or canceled paths. Stage gates deny scratch access before a verified dependency and recheck directive revision at the actual write. |
| Export source and trajectories | Existing root exporter and report trace with an added proof check. No new training data format or changes to learner/serving engines. |

The topology mounts `open-eval-handoff`, `sandbox/recovery`, and `scratch-handoff` directly inside the installed open-user-goal tree. The candidate receives one open user goal. Files and action domains are confined to its disposable workspace. The designated recipient is represented by an authorized scratch audience, with no channel messages, external publication, or writes to shared workspace main.
