# Application outcome runtime closure

The production Spectrolite teacher fixture imported `assessObservedApplicationOutcome`
from the System Testing skill without owning that package in its exact build closure.
The build resolver correctly refused the missing internal package.

Before editing, all eight pinned template sources were searched for absolute runtime,
type, relative and generated-code imports of the three observation/outcome modules.
The external runtime consumers were 15 units: Examples (1), Personal (6), Google
Workspace (4), Spectrolite (1), System (2), and News (1). Base had test strings only.
System Testing additionally owns its runner, main skill and mobile fixture consumers.
The runner's authored-teacher generated probe imports the observation module too.

Adding the entire System Testing skill would couple ordinary domain libraries to its
large harness and authority requests. Its development dependency graph also reaches
seven external consumers directly, making those new dependency edges cyclic for
validation. Its runtime-only closure already contains 124 units. The shared three
modules depend only on content-addressing and Node's built-in utilities, so Base now
owns them as `@workspace/application-outcomes`. All consumers declare that minimal
package. The former System Testing files and exports are removed; there is one owner
and no forwarding shim. Relative imports inside the common package stay local.

Declared runtime consumers after the move:

- `examples/skills/open-adventure-journey-runtime` (`@workspace-skills/open-adventure-journey-runtime`)
- `google-workspace/skills/google-drive` (`@workspace-skills/google-drive`)
- `google-workspace/skills/open-calendar-goal` (`@workspace-skills/open-calendar-goal`)
- `google-workspace/skills/open-gmail-goal` (`@workspace-skills/open-gmail-goal`)
- `google-workspace/skills/open-google-handoff-goal` (`@workspace-skills/open-google-handoff-goal`)
- `news/packages/news-live-evidence` (`@workspace/news-live-evidence`)
- `personal/skills/browser-import-runtime` (`@workspace-skills/browser-import-runtime`)
- `personal/skills/github` (`@workspace-skills/github`)
- `personal/skills/open-personal-artifacts-runtime` (`@workspace-skills/open-personal-artifacts-runtime`)
- `personal/skills/open-personal-automation-runtime` (`@workspace-skills/open-personal-automation-runtime`)
- `personal/skills/open-personal-goal` (`@workspace-skills/open-personal-goal`)
- `personal/skills/open-personal-history-runtime` (`@workspace-skills/open-personal-history-runtime`)
- `spectrolite/skills/spectrolite-review-fixtures` (`@workspace-skills/spectrolite-review-fixtures`)
- `system-testing/skills/mobile-system-testing` (`@workspace-skills/mobile-system-testing`)
- `system-testing/skills/system-testing` (`@workspace-skills/system-testing`)
- `system-testing/workers/system-test-runner` (`@workspace-workers/system-test-runner`)
- `system/skills/mobile-runtime-audit-bindings` (`@workspace-skills/mobile-runtime-audit-bindings`)
- `system/skills/open-system-diagnostics-runtime` (`@workspace-skills/open-system-diagnostics-runtime`)

Production `PackageGraph` takes source edges from dependencies and peers (not
`devDependencies`), then attaches generated framework/template build inputs before
computing its topological order. The unchanged exact-root resolver reads the owning
package manifest inside that selected closure; a graph node elsewhere is insufficient.
Therefore both the authored source imports and runtime dependency declarations are
required. Base's new `packages/application-outcomes` is an ordinary discovered
repository/package, needs no service authority, and is available before catalog skills.

Verification uses host-owned projections, never a tool rooted in an external template.
The three moved test files retain their 22 tests. A production graph/resolver diagnostic
composes Base with each legal domain template, builds 118 actual importing TS sources
across all 18 owners, verifies the common package is in each selected closure and that
external consumers do not acquire the System Testing harness, and proves a missing
exact-root package still fails through the unchanged resolver. Other domain dependencies
are external in this focused build; full native corpus qualification remains the final
integration evidence.

The native full-Base test projection also exposed an incompatible development-tool
merge: Runtime requested esbuild ^0.25.0 while React and the host use ^0.28.2. Across
the eight templates these are the only esbuild declarations. Runtime uses its esbuild
build API in two tests; its development declaration now matches ^0.28.2. No dependency
merge/resolution guard changed.

Compiling every importing source exposed an existing malformed portfolio handoff
predicate in System Testing (`&&.write` and an unbalanced ternary). It now requires
actual findings and branches on their write decision: a write verifies the grounded
bounded artifact explanation, private bytes, receipt and digest; a no-write requires
no receipt and no new handoff files. Task prompts and cases are unchanged.
