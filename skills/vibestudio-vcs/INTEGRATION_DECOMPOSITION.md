# Workspace integration

The conflict-resolution workflow starts from the assigned working head and incoming source event. It interprets
both intentions, plans an integration, applies exact edits, records VCS decisions, and checks the resulting state.

| Step | Implementation |
| --- | --- |
| Interpret local and incoming changes | `compareIntents.nl` calls `explainCompatibility.nl` with the actual VCS observations. |
| Select the content and decisions | `planResolution.nl` chooses edits and resolutions permitted for the observed coordinates. |
| Read, edit, and integrate | The scoped `workspaceIntegration` service calls VCS with explicit source and expected working head. |
| Verify the integration | `verifyIntegration.nl` checks the actual files and resolution state. The harness independently checks the same working head, file contents, and reachable decision history. |

The service is bound to one test-owned context and the assigned files. Edits and merge use separate expected-head
commands. If a merge fails after a successful edit, the workflow observes the new working head and recovers from
that state. The harness also verifies that the protected main event is unchanged.

The initial cases use the same settings conflict with different paths, repository identities, and values. They
share a source group. The user goal gives both intentions. The harness keeps expected JSON, seed metadata, and
reference solutions outside the model inputs. A separate harness qualification exercises a correct integration,
a candidate that drops the incoming change, and an alias with different inputs.
