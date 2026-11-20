# Open workspace repair and local rollout

The model receives the user's goal and the current owned workspace tools. The
unit inventory describes each visible candidate and capability grant. Durable
source coordinates, authored fault seeds and reference replacements stay in the
harness. The user decides whether to authorize a source fix, a local commit or
only investigation.

| Stage | Form | Responsibility |
| --- | --- | --- |
| Discover | Scoped service | List available owned units and their current allowed operation surface. |
| Choose target | Natlang lambda | Resolve the unit the goal actually identifies. Hold an ambiguous or unrelated target. |
| Inspect | Scoped service | Retain the exact working revision, real compiler diagnostic and authored editable production paths. |
| Diagnose | Natlang lambda | Explain the scope of the failure in terms of the real source and compiler evidence. Distinguish a protected contract or missing authorization from repairable code. |
| Propose | Natlang lambda | Produce complete before/after edits for the diagnosis and preserve stated behavior and any competing source edit. |
| Apply | Scoped service | Compare the observed working revision and exact old text. Reject a stale proposal before changing source. |
| Replan | Natlang lambda | Inspect new live evidence when a source edit raced or a candidate failed verification. Produce a different supported proposal or stop with the remaining blocker. |
| Verify | Native services and Natlang judgment | Run the exact candidate's real compiler and workerd suite. Explain the current outcome with its state identity. |
| Roll out locally | Scoped service | On explicit request, commit the exact independently verified candidate in its disposable context. The protected main ref remains outside the operation. |
| Independent outcome | Harness TypeScript | Rebuild and rerun the original immutable suite. Verify protected bytes, the actual working/commit identities, and the retained collaborator source. |

## Reuse and scope

- `skills/workspace-dev/SKILL.md` and `skills/vibestudio-workflows/runWorkflow/repairUnit.nl` describe source diagnosis, bounded repair, re-verification and protected policy. The open hierarchy adds target selection and local rollout before/after those decisions.
- `packages/natlang-services/src/unitRepair.ts` is the live worker source, revision, build and workerd suite boundary. Its canonical `createUnitRepair` is used for both the model-scoped actions and an independently initialized verifier.
- `system-testing/skills/system-testing/unit-repair-oracle.ts` and `tests/unit-repair.ts` pin the baseline worker path. The open worlds author additional real worker programs and retained regression suites.
- `workspace-repo-fixture.ts` imports hashed canonical file snapshots. The open adapter uses the same VCS operation and canonical ordering in the disposable case context, including independent reads of protected source and an actual competing VCS edit.
- `panel-repair-oracle.ts` uses a real renderer and CDP for editor navigation, save, and discard checks. A successful worker test contributes no renderer evidence. Panel cases use that adapter only when they exercise its real panel handle and browser flow.
