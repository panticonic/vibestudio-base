# Open capability and installed-skill planning

The user supplies the outcome and their permitted planning scope. The
workspace provides the live role-filtered catalog, the installed skill index,
and an optional owner-authored note. A note can be stale or inaccurate. The
program compares the note with what the caller can read now, then returns a
plan, a hold, or an authorized scratch handoff. It executes none of the
suggested service methods.

## Integration inventory

| Mechanism | Reused source | Role in this flow |
| --- | --- | --- |
| Authenticated live role projections | Host `src/server/services/docsService.ts` search, describe, getSchema and listServices; `packages/service-schemas/src/docs.ts` | System Testing binds the same RPCs, retains exact hits and typed descriptions, and proves presence and absence for the current caller. It issues no cross-context overrides. |
| Baseline semantic retrieval | System Testing `tests/docs-discovery.ts`; Base `sandbox/help/docHelp/keywords.nl`, `searchTerms.ts`, `sections.ts` and `rank.ts` | The goal call reuses the existing keyword lambda. Exact normalization, passage extraction and ranking also bound knowledge excerpts. The complete docHelp package remains callable and its fixtures stay outside the mounted program. |
| Workspace skill visibility | Host `workspaceService.ts` listSkills/readSkill; Base `packages/harness/src/tools/read.ts` | The same verified ambient workspace supplies each installed canonical repo path and its exact raw SKILL.md. List metadata identifies a candidate but proves no guidance. |
| Deep knowledge in the current lambda | `synthesizeCapabilityPlan.nl` with `docPlanSkills.load` scoped there | This semantic function already has the user request, memo and live candidate evidence. Load selected skill passages directly into its context so it can apply the exact installed policy to several choices. An isolated lambda returning a summary would lose local tradeoffs, source wording and authority conditions. |
| Approved handoff | Base `scratch-handoff-bindings`; System Testing `scratch-handoff-managed.ts` readWorkspaceBytes | Reuse its atomic writer and independent bounded byte read. Stage only a checked plan when the user requested one and the caller grant allows it. |
| Reference verification and capture | System Testing new owned context adapter, Host exact effect evidence, Natlang crosswalk | Confirm the live identity, method schema/argument names, exact installed skill receipt and exact quoted excerpt, retention of scratch output, and negative scope. Raw expected steps and reference fixture requests stay outside the model. |

`workOnCapabilityGoal` separates goal-specific catalog search, exact evidence
acquisition, plan synthesis, and optional handoff. `chooseDocRequests`
selects bounded topics and deciding descriptions from installed evidence.
`synthesizeCapabilityPlan` retains live interfaces and one or two exact skill
excerpts, reconciles a stale memo, and identifies genuinely unavailable
dependencies with role-limited evidence. TypeScript bounds retrieval and
joins exact IDs, bytes, hashes and schema fields. It does not decide what the
user meant or which legal combination should be proposed.

## Published-baseline extension

Main RPC and caller-specific runtime members share a verifier but keep their
own catalog identity, visibility, argument names, source signature, and schema
digest. Main RPC is appropriate when the goal asks for the receiver contract.
A Worker-runtime capability is appropriate when the specified API is the
portable client bound to that worker's runtime. The search must resolve to
the same exact entry before a plan can select it.

Installed skill receipts bind the semantic VCS working head read around the
raw SKILL.md bytes. The final result keeps that source revision and the exact
document digest. The verifier freshly reads each cited skill and its head.
The original docs-discovery tests and separate terminal corpus stay intact.

Qualification uses the existing HeadlessRunner open-goal path in the
published Examples composition, with the actual prepared fixture worker's
role. It reads the live catalog and installed skills, and can write the
explicitly authorized scratch handoff, with no model generation.
