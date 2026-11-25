# Planner value contracts (2026-11-25)

Pre-edit inventory. Baseline Base 28a65cd6579e405879eb9118d57f2e2aeb65cd06.
The live symptom is an NL planner refusing because its instructions demand effects
which its coordinator owns and its service scope excludes. This repair changes
instructions, not grants, operation order, goals, public types or runtime policy.

## Supply and consumers

The eight-template scan counted 1,228 NL sources and selected 287 planning/decision
candidates by name or return type: Base 203, Examples 2, Google 17, News 3,
Personal 38, Spectrolite 4, System 18, System-testing 2. Operational source/body
inventory: planner-value-contract-inventory.json under vibe-native-oracles-v21.
This selection is a review aid, not proof about every NL function. Base review
examined planner bodies and expanded suspicious I/O wording to callers/scopes.
Parent owns Spectrolite; Assembly independently reviews the other six templates.
Their successors and remaining exclusions are reported separately.

## Confirmed Base boundaries

Paths below are relative to skills/. Each chooser returns a value; its companion
folder contains no effect helper. The named coordinator performs the effect.

| Planner | Actual effect owner / consumed return |
| --- | --- |
| gad-context/natlang/workOnClientDiagnostics/chooseClientCheck.nl | workOnClientDiagnostics.nl executes ClientDiagnosticStep through clientDiagnostics; only that root has its service scope |
| pdf-intake/workOnPdfGoal/choosePdfScope.nl | workOnPdfGoal.ts binds the selection, extracts, reads layout and renders |
| template-candidate/reviewTemplateMigration/chooseMigrationEvidence.nl | reviewTemplateMigration.ts reads selected IDs, rediscovers on moved revision |
| open-user-goal/workOnAssemblyGoal/chooseAssemblyCandidate.nl | workOnAssemblyGoal.ts reads scope.inspect at inventory.head |
| open-user-goal/workOnAssemblyGoal/chooseAssemblyVerification.nl | workOnAssemblyGoal.ts runs selected verification IDs at inventory.head |
| open-user-goal/workOnProgramRunGoal/chooseRunSample.nl | workOnProgramRunGoal.ts invokes runSample for the selected ID |
| open-user-goal/workOnTerminalGoal/chooseTerminalAction.nl | workOnTerminalGoal.ts executes the returned change/transition/check/discover/stage action and records receipts |
| open-user-goal/workOnDictationHandoffGoal/decideDictationHandoff.nl | workOnDictationHandoffGoal.ts stages only the returned eligible local plan |
| open-user-goal/workOnEvalHandoffGoal/decideEvalHandoff.nl | workOnEvalHandoffGoal.ts performs one exact retry and reinvokes with retrySpent |
| open-user-goal/workOnProviderHandoffGoal/chooseRetainedResult.nl | workOnProviderHandoffGoal.ts reads the chosen result only when selection.read |
| open-user-goal/workOnRegencyBriefing/planRegencyReview.nl | workOnRegencyBriefing.ts obtains index/opening/current, forecasts and advances; retained memo is already index.memo (natlang-services serviceDeclarations.generated.ts RegencyIndex) |

## Exclusions checked

Clear selectors remain unchanged: chooseEvalAttempts returns exact run IDs;
choosePortfolioCriteria reads acceptance text already in current PortfolioFrame;
chooseDocRequests returns query requests; chooseIntentActions explicitly returns
operations without execution; decidePortfolioDelivery returns a disposition/write
flag; decideRunContinuation returns an ID/null. Other classifier bodies describe
criteria for their returned literals/records rather than demanding live effects.

Authorized orchestration remains valid: synthesizeCapabilityPlan calls admitted
docPlanSkills/docPlanCatalog; discoverSources calls admitted web.search;
searchRelevantIntent calls workspace.searchIntentCatalog; selectSource calls its
listRecords/readRecord children; selectProfile calls listProfiles/readProfile;
selectCheckpoints calls openCheckpoint; reviewBoardMigration/decideMigration
calls its admitted boardMigration.retain. These are not pure value-only planners.
planCanary/planCleanup already returns a list of cleanup steps and has no ambiguity
about actually closing the runtime during planning.

## Persistent authoring and generation

skills/natlang-authoring/SKILL.md is the installed reusable authoring source: add
an explicit per-lambda value/effect boundary there. Its reviewProgram children
inspect signatures, authority and topology; they do not generate planner bodies.
extensions/templates/authoring.ts projects existing authored repositories and
manifest selections, rather than synthesizing NL instructions.
packages/natlang/scripts/generate-semantic-entries.mjs serializes entries.json,
not bodies. Core compiler/project.ts produces typed .d.nl.ts declarations from
frontmatter; builtin generators embed existing .nl source. Exact defective-body
searches found the authored files themselves, no duplicate body generator.
No generated declaration edits are necessary.
The existing workspace install/discovery route consumes this source directly:
Host src/server/vcsHost/workspaceSkills.ts:39-51 indexes the installed repository
SKILL.md; Base packages/harness/src/resource-loader.ts:3-13 lists that index and
packages/harness/src/tools/read.ts:253-269 reads it via workspace.readSkill.
The successor template publication therefore distributes the authoritative skill;
there is no separate Codex cache installation to patch. Live installed workspaces
are deliberately left on their frozen source until the parent activates the bundle. prepareContentProject's
authorProjectDocuments.nl is an effectful document author with admitted callable
I/O, not a planner-code generator; its compose.planDocuments already states that
its caller owns source discovery and native writes.

## Runtime exclusions and limits

Core Node/Workerd/browser and managed llama, wllama, native Python and SGLang
engines execute/render supplied program bodies, not these authored planners.
No engine, service visibility or model scheduling changes are needed. The same
source fix reaches every model through normal template consumption. No paid
calls, inference or performance claims. Static metadata/caller checks can establish
unchanged signatures, grants and effect ownership; model behavior is unchecked
until ordinary collection on the successor pin.

## Validation

LOW ledger unit vibe-planner-value-contracts-static-20261125, budget 0.25 GiB,
reserve 7.5 GiB, finished exit 0. Header bytes are identical in all eleven NL
files; each has no callable effect-helper folder. Skill frontmatter is identical;
skill-creator quick_validate reports valid. Only planner bodies, the authoring
skill body and this inventory changed. git diff --check passed. No prose-match
tests, model calls, compiler rebuild or full native rerun were performed.
