# Agent Panel Workflow

Use one runtime concept: `PanelHandle`. `openPanel(source, options)` opens both
workspace panels and URLs and returns a handle. Opening a panel is a structural
tree mutation and may prompt on first use for the requester entity and
parent/root target. Use bounded `panelTree.roots()`/`panelTree.children()`/
`panelTree.search()` reads
to rediscover existing handles.

## Semantic workspace development

Workspace development runs on exact event/application state nodes, not
independent per-directory snapshots. Read the canonical
[Vibestudio VCS skill](../vibestudio-vcs/SKILL.md) before changing source.

The lifecycle is:

1. Call `vcs.status` and keep the returned committed event and working head.
2. Author through `edit`/`write` or the managed VCS edit surface. Each
   user-visible intent becomes a work unit and one local application.
3. Run the exact-context build report against that context's current
   materialization. Its structured bundling, TypeScript, and static authority
   diagnostics are the repair loop; tests and runtime checks are additional
   evidence.
4. If main or another source advanced, compare the exact source event. Adopt,
   merge useful changes through bounded coordinate pages, review composed intents, and
   run checks between them.
5. Commit the complete local application chain. Work that needs a different
   commit boundary belongs in another context.
6. Publish the clean committed event. Publication validates semantic ancestry
   and integration, reruns the exact-candidate build/typecheck/authority gate
   for affected units and dependents, obtains approval, and atomically advances
   protected refs.
7. Let the separate post-publication build projection produce an artifact, then
   open or reload the running unit at the intended build ref and verify
   behavior. Failed activation retains the previous runnable artifact.

Repository and path filters are views over this workspace graph. They are
useful for inspection, but they are not revision identity or commit boundaries.
Do not reconstruct incoming obligations or provenance from a rendered file diff.

Build verification enforces the platform TypeScript safety floor, even if a
project's `tsconfig.json` weakens it: strict types, checked indexed access,
complete return paths, no switch fallthrough, no unused labels or unreachable
code, and consistent filename casing. Diagnostics retain the compiler's numeric
identity in `compilerCode`, alongside the exact file and range. Indexed array,
record, and string reads can be `undefined`; guard the value before using it.
For a string character, `charAt()` returns an empty string when absent—use it
only when that behavior matches the application. Repair the source rather than
turning off the safety floor or asserting away an unproved invariant.

For managed source moves and copies, use `vcs.move` and `vcs.copy`, or
the managed runtime/agent filesystem adapter. A
move preserves `fileId`; a copy creates a new `fileId`, records an
`authored-copy-source` relation to the exact source file and state, and records
`copies-content` mappings for preserved coordinates. Neither operation relies
on delete/recreate heuristics.

For external ingress, use `vcs.importSnapshot` with a canonical credential-free
source URI, exact source revision, and complete repository/file descriptors
naming CAS bytes. The semantic workspace verifies those host-observed
descriptors and derives the snapshot digest. Do not reconstruct an import as a sequence of ordinary
authored edits or partial repository loops.

When authoring source with regular expressions or other backslash-sensitive
syntax, prefer the edit tool's literal source text. If code is constructed inside
an eval JavaScript string, account for that string's escaping separately from
the emitted source (a `String.raw` template preserves its backslashes). Read the
written source and test representative valid and invalid inputs; a clean
TypeScript build cannot establish that a validator accepts valid user data.

## Verify the requested result

Derive acceptance criteria from the requested behavior and the application's
contracts. A successful build establishes executable source, not a working
application. Exercise each core user flow with representative inputs and
observe its completed result before starting a dependent action. For saved
user data, verify the intended storage boundary and persistence after reload;
wait for the loaded application state before judging the result.

Inspect the actual rendered interface and runtime diagnostics after the final
interaction. Use the panel lifecycle and browser guidance linked by this skill
for exact handles, observations, screenshots, and cleanup. Keep the same
application identity through source changes, and verify the requested release
after publication when publication is part of delivery.

Recovery does not erase an earlier problem. Preserve the original structured
failure and the evidence of its repair, distinguish intentional failing checks
from incidental errors, and report problems encountered even when the final
application works. Do not clear diagnostics to manufacture a clean history or
substitute a separate implementation to avoid a broken product path. Do not
invent defects merely to demonstrate a development loop. For explicitly
requested fault-injection or regression tests, keep intentional failures in an
isolated candidate, verify failed artifacts remain inactive, and repair them
before publication.

## Design principles

Before scaffolding, decide on persistence and agent integration:

- **Persistence**: use Durable Object SQLite for live transactional state
  (see [WORKERS.md](WORKERS.md#durable-object-backed-app-databases)); use
  version-controlled files under `projects/` for editable content that agents
  and humans jointly author. Do not leave meaningful state in ephemeral
  structures.
- **Agentic integration**: expose DO methods with `@rpc` contracts so agents
  can exercise the same operations as the UI. Wire conversational surfaces
  into the workspace channel system. Build for agents from the start, not as
  an afterthought.
- **Production quality**: build durable infrastructure, not prototypes. Proper
  schemas, error surfaces, edge-case coverage, and principled state
  management from the first scaffold. No hardcoded demo data or placeholder
  content — build real empty states and real data flows.
- **Theme and layout**: follow the host's live appearance using the contract
  below. Build responsive layouts for desktop, tablet, and mobile hosts.

### Theme and layout

The host owns the user's light/dark choice. Automatically mounted React panels
already receive a Radix `Theme` with live appearance and theme configuration;
the builder supplies Radix and UI foundation styles. Export your component and
use that wrapper. Do not add a fixed `appearance="light"`/`"dark"` wrapper or a
separate persisted theme setting. OS `prefers-color-scheme` alone does not
represent an explicit in-app choice.

Radix components inherit the appearance, but custom CSS still has to use
theme-aware colors. For example, inside the supplied wrapper:

```css
.board {
  min-height: 100dvh;
  background: var(--color-background);
  color: var(--gray-12);
}
.task-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}
.task-description {
  color: var(--gray-11);
}
.task-selected {
  background: var(--accent-a3);
}
```

Apply these tokens to component classes inside the theme wrapper, rather than
expecting wrapper-scoped variables to inherit upwards into `body` or `:root`.
Cover inputs, menus, dialogs, empty states, hover/focus/disabled states, and
gradients as well as the page background. Custom branding and artwork are
welcome; pair custom surface and text colors for both appearances rather than
hardcoding a single UI palette.

Use `usePanelTheme()` from `@workspace/react` when code needs the live appearance
(for example, canvas rendering or a chart library). It is unnecessary for CSS
that already consumes theme tokens. For a manually mounted or non-React panel,
use `panel.getTheme()` and `panel.onThemeChange()` from `@workspace/runtime` to
drive its own styling and release the subscription on teardown.

Scope view state to the record it describes. When switching or creating a
board, project, or similar container, clear or deliberately restore its own
search, filters, selected child, and open detail view. A query retained from an
unrelated container must not make newly created data appear missing. Give empty
filtered views a visible way to clear the filter. Verify creation after a
filtered view and navigation between containers through the UI.

Verify a newly authored or restyled UI in both host appearances, including a
switch while the panel stays open. Check readability of surfaces, controls,
overlays, and interaction states; merely observing a theme hook or `.dark`
class is insufficient. Use the host appearance control and restore the prior
setting afterward. A DOM class override or OS media emulation alone does not
verify host-to-panel propagation. If the runtime receives the wrong appearance,
investigate that path instead of compensating with app-local theme state.

Use responsive flex/grid layouts and constrained media; inspect a narrow
viewport as well as desktop width.

## Development loop

1. Prepare a context-local candidate. For a new persistent app, first author
   the complete authority policy using [PROJECTS.md](PROJECTS.md): justify its
   callers, data, effects, resources, website decisions, binding, and notability.
   Then prepare code and wiring together:

```ts
import { prepareApplication } from "@workspace-skills/workspace-dev";
scope.prepared = await prepareApplication({
  name: "my-app",
  title: "My App",
  authority: scope.authorityPolicy,
});
scope.panelSource = scope.prepared.panel.created;
scope.workerSource = scope.prepared.worker.created;
return scope.prepared;
```

`scope.authorityPolicy` must be authored before this invocation; it is not
inferred from the name or filled by the helper. The result is an object with
`panel`, `worker`, `service`, `preparation`, and `authorityReview`.
Each unit has its canonical `created` path, files, preflight, preparation,
and review packet. For standalone units/custom wiring use `prepareProjects`
with an array; executable inputs require an explicit manifest and rationale.

Preparation makes one atomic context edit and leaves publication/live runtime
unchanged. Retain its exact `workingHead`, structural preflight, and authority
review. Preflight does not certify the semantic build. Inspect structured
dependency diagnostics and repair named source or manifests.

Never call either preparation API again to recover an existing candidate.
After a lost response, inspect VCS status and destinations first. After a later
build, open, or publication failure, reuse the retained canonical source path
and repair that phase. Do not add another `panels/` prefix.

### Review, verify, and publish

Stage two uses ordinary authoring and VCS. Review is over actual current code
and policy, not just the preparation receipt. Any edits invalidate the earlier
reviewed basis and require renewed review/verification.

2. Edit with the `edit`/`write` filesystem tools, not eval. Keep semantic
   intent together: a coordinated rename, schema/client update, or multi-file
   behavior change should be one coherent work unit even when it crosses
   repository views.

Review every requested capability/resource/tier and provided capability against
the actual code and intended data use, including host effects, service callers,
website eligibility, receiver effect/sensitivity, binding, and notability.
Read `AUTHORITY.md` as rationale, not proof or a grant. Remove unjustified
requests; a build suggestion is not a reason to request more authority.

3. Keep the returned working head, then run the exact-context build report.
   For panels, `services.build.getBuildReport(source,
\`ctx:${ctx.contextId}\`)`requests the canonical structured check, including
   missing authority requests for statically known calls. A declaration is a
   request for review, not a grant.`runtime.supervision.health(identity)` only
   reads the exact live entity's health/log records and does not compile the
   working source. Read every error in the report, repair its cited
   file/line/column, and rerun until it is clean.
   The push gate repeats the report on the exact candidate state; it is
   authoritative, while this local report is the fast feedback loop.

4. Compare with current main before committing or publishing:

```ts
import { vcs } from "@workspace/runtime";

const status = await vcs.status();
const comparison = await vcs.compare({
  target: status.workingHead,
  sourceEventId: status.mainEventId,
  view: "changes",
});

console.log(comparison.counts, comparison.coordinates, comparison.intents);
```

The portable runtime VCS client is bound to the panel/worker/eval semantic
context. It fills an omitted `contextId` only for methods whose generated
schema declares a top-level context reference, so `vcs.status()` is the normal
orientation call while provenance reads such as `vcs.inspect()` keep their
strict context-free payload. Pass `{ contextId }` only to methods whose schema
accepts it and only when intentionally addressing another authorized context.

If there is incoming work, use `vcs.merge` to adopt mergeable stable
coordinates. Review the intent projection and every composed coordinate;
resolve conflicts with `theirs`, `ours`, or `current` after authoring any
truthful combined value. Continue from each returned working head until the
comparison is both complete and concluded.
When judgment changes product intent, show the alternatives and ask the user.

5. Commit the complete local chain as one truthful semantic boundary:

```ts
const committed = await vcs.commit({
  commandId: crypto.randomUUID(),
  contextId: ctx.contextId,
  expectedWorkingHead: latestWorkingHead,
  message: "Implement the panel behavior",
  intentSummary:
    "Preserve the reviewed interaction contract as one deployable milestone",
});
```

There is no staging or partial commit. Split independent work into another
context before authoring it. Use `vcs.revert` for a deliberate counteraction or
`vcs.discard` to drop the complete uncommitted chain.

6. Publish only after the context is clean and the intended event passes its
   ordinary checks. If current main advanced, compare and merge it locally,
   commit the resulting complete chain, then retry publication. The protected
   push gate rechecks the exact candidate build/typecheck state before approval;
   a failure returns diagnostics and moves no protected pointer. Repair, make
   a new local application, commit it, and retry from that exact event. A
   later post-publication projection or activation failure leaves publication
   in place and retains the previous runnable artifact.

Every semantic context mutation includes `expectedWorkingHead` and a `commandId`.
When a response is lost, retry the identical request with the same command ID.
After `RevisionChanged` or any request change, re-observe the basis and use a
new command ID. Follow the typed discriminant, not prose.

7. Open once after a green publication, or open an explicitly ref-pinned
   context build when the API supports it:

```ts
import { openPanel } from "@workspace/runtime";

const myApp = await openPanel(scope.createdProject.created, { focus: true });
scope.myAppPanel = myApp;
scope.myAppPanelId = myApp.id;
const first = await myApp.snapshot();
return {
  panelId: myApp.id,
  attemptId: first.attemptId,
  buildKey: first.buildKey,
  text: first.document.text,
};
```

Eval scope has two layers. The 30-minute warm notebook lease retains
`scope.myAppPanel` as the same live `PanelHandle` across cells. The exact
durable recovery snapshot retains `scope.myAppPanelId` and other serializable
provenance, but never manufactures a methodless copy of a class instance.
Reuse the live handle when present. After `[kernel] Restarted` explicitly names
it as lost, recover it without opening a duplicate:

```ts
const myApp = scope.myAppPanel ?? getPanelHandle(scope.myAppPanelId);
scope.myAppPanel = myApp;
```

Runtime-managed workers and Durable Objects follow their owning context unless
explicitly pinned to another `ref`. Panel APIs keep their own build-ref
semantics; when testing unpublished panel code, pass the context ref on the
ref-capable launch/navigation path.

8. Iterate visually with the same panel identity:

```ts
import { getPanelHandle } from "@workspace/runtime";

const myApp = scope.myAppPanel ?? getPanelHandle(scope.myAppPanelId);
scope.myAppPanel = myApp;
const observation = await myApp.rebuild();
console.log(observation.phase, observation.attemptId, observation.buildKey);
const capture = await myApp.snapshot();
console.log(capture.document.text);
```

`rebuild()` transactionally prepares and activates a new immutable runtime
attempt at the panel's active build ref, then waits for the application boot
handshake. It does not create work, commit an event, publish main, or affect
child panels. The stable panel id remains valid, but CDP endpoints belong to
runtime incarnations. For multi-step automation acquire one
`let session = await myApp.cdp.session()`. After `rebuild()` or `navigate()`
resolves, call `session = (await session.refresh()).session` and continue with
`session.page`. The refresh receipt distinguishes an unchanged generation, a
reconnected page, and a replaced runtime without replaying an uncertain action.

| Method       | Completion                                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| `observe()`  | Returns the canonical current attempt and phase without mutating it                     |
| `rebuild()`  | Atomically replaces the current entry with a prepared attempt and returns at boot-ready |
| `reload()`   | Reloads the current renderer and returns at boot-ready                                  |
| `navigate()` | Prepares a new source/ref/context attempt and returns at boot-ready                     |

Before reloading a parent or ancestor, verify the target:

```ts
const observed = await handle.observe();
console.log(
  observed.panelId,
  observed.source,
  observed.contextId,
  observed.requestedRef,
  observed.runtimeEntityId,
  observed.buildKey,
  observed.phase,
);
```

Readiness-bearing lifecycle results are `PanelObservation` values. `phase:
"ready"` means both host navigation and application bootstrap completed.
Failures throw `PanelOperationError` with the same provenance fields.
Slot creation itself is durable and immediately observable; runtime preparation
continues asynchronously so one broken panel cannot hold the panel-tree queue.
`createPanelSlot` exposes that durable boundary without focusing or waiting.
The server's level-triggered execution reconciler owns activation after the
commit and resumes preparing reservations after transient failures or restart.
`openPanel` joins that same idempotent activation, materializes the registered
panel principal, then waits on the exact server-minted attempt through
`awaitAttempt`; it does not poll. It returns on the first valid ready
observation, rejects terminal failures immediately, and otherwise waits until
caller cancellation. Use a stable `operationId` to make retried creation address
the same slot. The retry identity also contains the source, context, parent, and
ref; exact redelivery resumes the first commit and a different logical open
cannot alias it. Do not combine `operationId` with `slug`.

9. Tune running state without reopening:

```ts
await scope.myApp.stateArgs.set({ theme: "dark", mode: "fixture" });
await scope.myApp.setMode("fixture");
```

## Managing child panels

Use bounded `panelTree.roots()` and `panelTree.children()` reads from agent
eval. `roots({ limit })` is scoped to the current verified caller. Use
`rootOwners()` plus `rootsForOwner(ownerUserId, ...)` for a cross-owner
inventory; visibility is unchanged. Archive stale children explicitly; do not
materialize the entire tree.

```ts
import { panelTree } from "@workspace/runtime";

const roots = await panelTree.roots({ limit: 100 });
for (const { node, handle } of roots.entries) {
  console.log(node.childCount, handle.id, handle.title);
}

const page = await panelTree.children(scope.myApp.id, { limit: 100 });
for (const { handle } of page.entries) {
  console.log(handle.id, handle.kind, handle.source);
}
await page.entries[0]?.handle.archive();
```

Reuse an existing handle instead of opening duplicates. Scalar handle fields
are last-observed descriptors; call `handle.observe()` whenever live state
matters. Across warm eval cells, keep the handle in `scope`; keep its stable ID
beside it for cold recovery. After an explicit kernel restart, rediscover a
lost handle with `getPanelHandle(id)`. Archive temporary
inspection, browser, diagnostic, and child panels in `finally`.

## Browser panels

URLs also use `openPanel`:

```ts
import { openPanel } from "@workspace/runtime";

const sitePanel = await openPanel("https://example.com", { focus: true });
try {
  const page = await sitePanel.cdp.page();
  await page.title();
} finally {
  await sitePanel.archive();
}
```

CDP automation lives under `handle.cdp`. `openPanel()`, `focus()`, `navigate()`,
`reload()`, and `rebuild()` already establish boot readiness; there is no
separate handle lease/load step.

## Verification

Use `handle.snapshot()` for a provenance-bearing agent-readable view and read
its `document` field. Use `handle.tree()`,
`handle.state()`, and `handle.routes()` for deeper inspection. Typecheck before
launch when the change is more than a small text edit.

The verification boundary is exact: lifecycle readiness and rendered
correctness are different facts. `openPanel()`, `rebuild()`, and `observe()` may
return `phase: "ready"` once the immutable attempt has booted, but create,
fork, open, rebuild, debug, and polish work is not complete until a matching
`snapshot()` has been captured and inspected. Return the observation and
snapshot together so `panelId`, `attemptId`, `runtimeEntityId`, and `buildKey`
can be joined. If the snapshot is blank, contains the boot-error shell, or does
not show the intended behavior, diagnose and repair it; never summarize the
ready phase as success.

For runtime failures, choose the narrowest log surface first:
`handle.diagnose()` for the canonical observation plus bounded renderer evidence,
`runtime.supervision.health(identity)` for exact live-entity state, and
`serverLog` for host
behavior. The `serverLog` service and `skills/server-logs/SKILL.md` are owned by the System workspace. For an ordinary panel, start with its local diagnostic packet before switching to System for host logs.

Tie every verification result to its exact build/state provenance. If the
runtime appears unchanged, verify the active build ref and traverse the
expected work unit, application, event, and publication instead of repeating
the edit.

## Forking existing projects

Forking is a semantic operation, not an unstructured directory copy. Dry-run
the workspace-dev helper to review metadata and class rewrites, then apply it
as one coherent lifecycle work unit:

```ts
import { forkWorker } from "@workspace-skills/workspace-dev";

const plan = await forkWorker({
  from: "workers/source-worker",
  name: "new-worker",
  title: "New Worker",
  dryRun: true,
});
console.log(plan);
```

Use `forkPanel({ from, name, title, dryRun })` for panels. These typed helpers
own the canonical destination section, so an isolated dry run is still planned
under `workers/` or `panels/`; `dryRun: true` itself guarantees that no
destination is written. Use generic `forkProject({ from, to, projectType })`
only for an intentional advanced lifecycle operation. Crossing project types
is rejected unless `projectType` explicitly opts into it.

Apply a panel fork with an explicit durable phase boundary:

```ts
import { forkPanel } from "@workspace-skills/workspace-dev";
import { openPanel } from "@workspace/runtime";

scope.forkPlan = await forkPanel({ from, name, title, dryRun: true });
scope.forkedProject = await forkPanel({ from, name, title, dryRun: false });
scope.forkedPanel = await openPanel(scope.forkedProject.created, {
  contextId: ctx.contextId,
  ref: `ctx:${ctx.contextId}`,
});
return {
  plan: scope.forkPlan,
  created: scope.forkedProject,
  observation: await scope.forkedPanel.observe(),
  snapshot: await scope.forkedPanel.snapshot(),
};
```

Eval rejection never rolls back an already applied fork. If open, observe, or
snapshot fails, resume from the scoped receipt/handle and retry only that later
phase. `snapshot()` returns a structured capture object rather than a string;
do not call `slice()` or other string methods on it.

Every canonical panel and worker in the workspace is continuously checked
against this same fork preflight. A dry-run failure is therefore concrete
source/manifest drift or a platform analyzer defect, never a reason to add a
legacy bypass.

For workers with multiple Durable Object classes, pass an explicit `classMap`.
After applying, inspect the returned working head and work-unit identity, run
the build, commit the complete chain, publish, then launch the intended build.

Use the VCS file-copy batch when the operation is literally a set of managed
file copies with exact source and content-mapping provenance. Use a dedicated
lifecycle/fork operation when package metadata, runtime registrations, class
names, and other dependent intent must change together. Neither should infer a
semantic boundary from selected paths or content similarity.
