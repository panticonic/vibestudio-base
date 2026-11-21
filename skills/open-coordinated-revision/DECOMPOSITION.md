# Coordinate a local workspace document change

| Production mechanism and consumers | How the program uses it |
| --- | --- |
| `skills/workspace-document-revision/{chooseRevision,reconcileRevision}.nl` and the live workspace-edit baseline | Retain the existing minimal text edit and conflict reconciliation policies. Call them separately per selected destination. Keep source and target observations exact. A competing change can preserve, supersede, or invalidate a candidate. |
| `skills/vibestudio-workflows/evidence/checkSupport.nl` and its installed workspace-evidence skill | Independently decide what a current signed decision, documented draft, archived file, or contradictory approval supports. Authorize nothing from a stale or ambiguous source. Use the current evidence before initial planning and after native revision conflict. |
| `packages/runtime/src/shared/vcsClient.ts`, Host VCS dispatcher, and `workers/workspace-source/semanticWorkspace.ts` | Load one bounded catalog pinned to a working ref, and read exact original Markdown commits. For local authorized effects, submit one owner-scoped semantic VCS edit whose expected working head guards the whole batch. No push, commit, unscoped path, or overwrite. |
| System Testing catalog and Host exporter | Seed individually signed or pending topic facts and real concurrent semantic edits. Verify each destination/source independently by stable file identity, exact contents and digest, CAS basis, and unchanged protected main. Prove complete Natlang effects and preserve test assignments. |

1. Discover current documents and repeat the user's requirements precisely. Use the installed evidence checker to determine whether exact observations support each applicable requirement.
2. Choose the authorized destinations and call the installed revision policy separately for each. Keep every requested document tied to the same working head. No effect for a proposed draft, a withdrawn decision, an ambiguous destination or an identical saved version.
3. Submit the whole justified batch against the reviewed working head. If the basis changed, read the same documents again, re-check authority, and call the installed reconciliation policy per destination. Do not replay the old candidate.
4. Apply a single reconciled batch or hold it when one required document fails. Verify the resulting native readback and unchanged protected official state. Explain any existing or competing text.
