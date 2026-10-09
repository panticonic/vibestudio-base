# Agent Panel Workflow

Panels are handled through one runtime type, `PanelHandle`.
`openPanel(source, options)` opens both workspace panels and URLs and returns a
handle. Opening a panel changes the panel tree, so the first time it may ask
for approval for the requesting entity and the parent or root target. To find
existing handles again, use the paged `panelTree.roots()`,
`panelTree.children()`, and `panelTree.search()` reads.

## Semantic workspace development

Workspace development works on the workspace's event and application history,
not on separate per-directory snapshots. Read the [Vibestudio VCS
skill](../vibestudio-vcs/SKILL.md) before changing source.

The lifecycle is:

1. Call `vcs.status` and keep the returned committed event and working head.
2. Author through `edit`/`write` or the managed VCS edit tools. Each
   user-visible intent becomes a work unit and one local application.
3. Run the build report for the context against its current materialization.
   Its structured bundling, TypeScript, and static authority diagnostics drive
   the repair loop; tests and runtime checks are additional evidence.
4. If main or another source has moved on, compare against its source event.
   Adopt or merge useful changes through paged coordinate views, review the
   combined intents, and run checks in between.
5. Commit the complete local application chain. Work that needs a different
   commit belongs in another context.
6. Publish the clean committed event. Publication checks semantic ancestry and
   integration, reruns the build, typecheck, and authority gate on the candidate
   for affected units and their dependents, asks for approval, and then
   advances the protected refs atomically.
7. After publication, a separate build step produces the artifact. Open or
   reload the running unit at the intended build ref and check its behavior. If
   activation fails, the previous runnable artifact stays in place.

Repository and path filters are only views of the workspace graph. They help
with inspection but do not identify revisions or define commits. Do not
reconstruct incoming changes or provenance from a rendered file diff.

Build verification enforces a TypeScript safety floor even if a project's
`tsconfig.json` relaxes it: strict types, checked indexed access, complete
return paths, no switch fallthrough, no unused labels or unreachable code, and
consistent filename casing. Each diagnostic keeps the compiler's numeric code in
`compilerCode` along with the file and range. Indexed array, record, and string
reads can be `undefined`; check the value before using it. For a string
character, `charAt()` returns an empty string when the index is out of range;
use it only when that is the behavior you want. Fix the source instead of
turning off the safety floor or asserting an invariant you have not
established.

To move or copy managed source, use `vcs.move` and `vcs.copy`, or the managed
runtime/agent filesystem adapter. A move keeps the `fileId`. A copy gets a new
`fileId`, records an `authored-copy-source` relation to the source file and
state, and records `copies-content` mappings for the preserved coordinates.
Neither works by deleting and recreating files.

To bring in external source, use `vcs.importSnapshot` with a credential-free
source URI, the exact source revision, and complete repository and file
descriptors that name CAS bytes. The workspace verifies those host-observed
descriptors and computes the snapshot digest. Do not recreate an import as a
series of authored edits or per-repository loops.

When writing source that contains regular expressions or other
backslash-sensitive syntax, prefer the edit tool's literal text. If you build
code inside a JavaScript string in eval, account for that string's escaping
separately from the source it produces (a `String.raw` template keeps
backslashes as written). Read back the written source and test representative
valid and invalid inputs: a clean TypeScript build does not show that a
validator accepts valid user data.

## Verify the requested result

Derive acceptance criteria from the requested behavior and the application's
contracts. A successful build shows the source runs, not that the application
works. Exercise each core user flow with representative inputs and observe its
result before starting a dependent action. For saved user data, check that it
lands in the intended storage and survives a reload; wait for the application
to finish loading before judging.

After the last interaction, inspect the rendered interface and runtime
diagnostics. Use the panel lifecycle and browser guides linked from this skill
for handles, observations, screenshots, and cleanup. Keep the same application
identity across source changes, and verify the released version after
publication when publication is part of the task.

A fix does not erase the earlier problem. Keep the original structured failure
and the evidence of its repair, distinguish intentionally failing checks from
incidental errors, and report problems you hit even when the final application
works. Do not clear diagnostics to make the history look clean, and do not
swap in a separate implementation to avoid a broken product path. Do not invent
defects to demonstrate a development loop. If the user explicitly asks for
fault-injection or regression tests, keep the intentional failures in an
isolated candidate, check that failed artifacts stay inactive, and repair them
before publication.

## Design principles

Before scaffolding, decide how the app stores data and how agents use it:

- **Persistence**: use Durable Object SQLite for live transactional state (see
  [WORKERS.md](WORKERS.md#durable-object-backed-app-databases)). Use
  version-controlled files under `projects/` for editable content that agents
  and people write together. Do not keep meaningful state only in memory.
- **Agent integration**: expose DO methods with `@rpc` contracts so agents can
  perform the same operations as the UI. Connect conversational features to the
  workspace channel system. Design for agents from the start.
- **Production quality**: build for real use from the first scaffold, with
  proper schemas, visible errors, edge-case handling, and well-managed state.
  No hardcoded demo data or placeholder content; build real empty states and
  data flows.
- **Theme and layout**: follow the host's live appearance as described below,
  and build responsive layouts for desktop, tablet, and mobile hosts.

### Theme and layout

The host owns the user's light/dark setting. Automatically mounted React panels
already get a Radix `Theme` with the live appearance and theme configuration,
and the builder supplies the Radix and UI foundation styles. Export your
component and use that wrapper. Do not add a wrapper with a fixed
`appearance="light"`/`"dark"` or a separately stored theme setting. The OS
`prefers-color-scheme` does not reflect the user's in-app choice.

Radix components inherit the appearance, but custom CSS must still use
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

Apply these tokens to component classes inside the theme wrapper; variables
scoped to the wrapper do not reach `body` or `:root`. Cover inputs, menus,
dialogs, empty states, hover/focus/disabled states, and gradients, not just the
page background. Custom branding and artwork are welcome, but define surface
and text colors for both appearances instead of hardcoding one palette.

Use `usePanelTheme()` from `@workspace/react` when code needs the live
appearance, for example for canvas rendering or a chart library. CSS that
already uses theme tokens does not need it. In a manually mounted or non-React
panel, use `panel.getTheme()` and `panel.onThemeChange()` from
`@workspace/runtime` to drive its styling, and unsubscribe on teardown.

Tie view state to the record it belongs to. When switching to or creating a
board, project, or similar container, clear or deliberately restore that
container's search, filters, selected child, and open detail view. A search
left over from another container must not make new data look missing. Give
empty filtered views a visible way to clear the filter. Test creating an item
while a filter is active and moving between containers through the UI.

Check new or restyled UI in both host appearances, including switching while
the panel stays open. Check that surfaces, controls, overlays, and interaction
states are readable; seeing a theme hook fire or a `.dark` class is not enough.
Use the host's appearance control and restore the previous setting afterwards.
Overriding a DOM class or emulating the OS media query does not test that the
host's setting reaches the panel. If the panel receives the wrong appearance,
investigate that path instead of working around it with app-local theme state.

Use responsive flex/grid layouts and constrained media, and check a narrow
viewport as well as desktop width.

## Development loop

1. Prepare a candidate in the current context. For a new persistent app, first
   write the complete authority policy as described in
   [PROJECTS.md](PROJECTS.md), justifying its callers, data, effects,
   resources, website decisions, binding, and notability. Then prepare code and
   wiring together:

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

`scope.authorityPolicy` must exist before this call; the helper does not derive
it from the name or fill it in. The result is an object with `panel`, `worker`,
`service`, `preparation`, and `authorityReview`. Each unit has its `created`
path, files, preflight, preparation, and review packet. For standalone units or
custom wiring, call `prepareProjects` with an array; executable units need an
explicit manifest and rationale.

Preparation makes one atomic edit in the context and does not touch
publication or the live runtime. Keep its `workingHead`, structural preflight,
and authority review. Preflight does not check the semantic build. Read the
structured dependency diagnostics and fix the named source or manifests.

Never call either preparation API again to repair an existing candidate. When
you received its result, replay the retained `preparation.command` with ordinary
`vcs.edit`. Preparation returns the full command/application/work-unit receipt.
If the response itself is lost, recovery requires a caller-owned `commandId` and
`expectedWorkingHead` retained before mutation; pass them before preparation and
regenerate at that original identity and basis. VCS replays identical requests
and refuses changed ones. Without that retained identity, a new helper call is
a new command, and the occupied destination is rejected without overwrite. See
[preparation recovery](PROJECTS.md#review-verify-and-publish).
If a later
build, open, or publication step fails, reuse the source path you stored and
fix that step. Do not add another `panels/` prefix to it.

### Review, verify, and publish

From here on you use normal authoring and VCS. Review the current code and
policy, not just the preparation receipt. Any edit invalidates the earlier
review and requires reviewing and verifying again.

2. Edit with the `edit`/`write` filesystem tools, not eval. Keep related
   changes together: a coordinated rename, a schema and client update, or a
   multi-file behavior change should be one work unit, even if it spans
   repositories.

Check every requested capability, resource, and tier, and every provided
capability, against what the code actually does and the data it uses. This
includes host effects, service callers, website eligibility, receiver effect
and sensitivity, binding, and notability. `AUTHORITY.md` explains the reasoning;
it is not proof or a grant. Remove requests you cannot justify, and do not add
authority just because a build suggests it.

3. Keep the returned working head, then run the build report for the context.
   For panels, ``services.build.getBuildReport(source, `ctx:${ctx.contextId}`)``
   runs the structured check, which also reports missing authority requests
   for statically known calls. A declaration requests review; it does not grant
   anything. `runtime.supervision.health(identity)` only reads health and log
   records of the live entity and does not compile the working source. Read
   every error in the report, fix the cited file/line/column, and rerun until
   it is clean. The push gate repeats the report on the candidate state and its
   result is final; the local report is for fast feedback.

4. Review the local work against protected main before publishing:

```ts
import { vcs } from "@workspace/runtime";

const status = await vcs.status();
const comparison = await vcs.compare({
  target: { kind: "event", eventId: status.mainEventId },
  source: status.workingHead,
});

console.log(comparison.counts, comparison.coordinates, comparison.intents);
```

The runtime `vcs` client in panels, workers, and eval is bound to their
semantic context. It fills in an omitted `contextId` only for methods whose
generated schema has a top-level context reference, and mints a fresh
`commandId` for each mutation. So `vcs.status()` is the usual first call,
while provenance reads such as `vcs.inspect()` keep their context-free
payload. Pass `{ contextId }` only to methods whose schema accepts it, and
only when you mean to address another context you are authorized for.

5. Publish the complete local chain as one commit that accurately describes
   it:

```ts
const published = await vcs.publish({
  message: "Implement the panel behavior",
  intentSummary:
    "Preserve the reviewed interaction contract as one deployable milestone",
});
if (published.status === "integration-required") {
  // Main moved; nothing was committed or pushed. Review published.compare,
  // merge with vcs.merge, then publish again.
}
```

There is no staging area or partial commit. Put independent work in another
context before writing it. Use `vcs.revert` to deliberately undo a change, or
`vcs.discard` to drop the whole uncommitted chain.

6. On `integration-required`, merge the incoming coordinates with `vcs.merge`.
   Review the intent view and every combined coordinate. Resolve conflicts
   with `theirs`, `ours`, or `current`, after writing a correct combined value
   where needed. Continue from each returned working head until the
   comparison is complete and concluded. If a decision changes what the
   product does, show the user the options and ask. Then publish again. The
   protected push gate rechecks the candidate's build and typecheck before
   approval; if it fails, it returns diagnostics and moves no protected ref.
   Fix the problem and publish again. If the later post-publication build or
   activation fails, the publication stands and the previous runnable
   artifact stays active. After `RevisionChanged`, re-read the current state
   and call again. Branch on the typed result, not its message text.

7. Open the panel once after a successful publication, or open a build pinned
   to the context ref where the API supports it:

```ts
import { openPanel } from "@workspace/runtime";

const myApp = await openPanel(scope.panelSource, { focus: true });
scope.myAppPanel = myApp;
const first = await myApp.snapshot();
return {
  panelId: myApp.id,
  attemptId: first.attemptId,
  buildKey: first.buildKey,
  text: first.document.text,
};
```

`scope.myAppPanel` stays the same live `PanelHandle` across cells while the
notebook is warm (a 30-minute lease). A kernel restart restores it too: the
recovery snapshot keeps the handle's id and reacquires it by id, so never open
a duplicate to get it back.

Runtime-managed workers and Durable Objects run the code of their own context
unless pinned to another `ref`. Panels choose their build ref separately: to
test unpublished panel code, pass the context ref when opening or navigating.

8. Iterate visually on the same panel:

```ts
const myApp = scope.myAppPanel;
const observation = await myApp.rebuild();
console.log(observation.phase, observation.attemptId, observation.buildKey);
const capture = await myApp.snapshot();
console.log(capture.document.text);
```

`rebuild()` prepares and activates a new immutable runtime attempt at the
panel's active build ref, then waits for the application's boot handshake. It
does not create work, commit, publish, or affect child panels. The panel id
stays valid, but CDP endpoints belong to a single runtime incarnation. For
multi-step automation, acquire the panel's stable session with
`const session = await myApp.cdp.session()`. After `rebuild()` or `navigate()`
resolves, keep using `session.page`; its next awaited operation binds the new
generation, and an operation that was in flight rejects with
`panel_cdp_generation_changed` instead of being replayed. Read
`session.receipt` to distinguish acquisition, reconnection, and replacement.
Listeners, `consoleEvents()`, and locators do not carry across a generation;
recreate them from `session.page`.

| Method       | Completion                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| `observe()`  | Returns the current attempt and phase without changing anything              |
| `rebuild()`  | Replaces the current entry with a prepared attempt and returns at boot-ready |
| `reload()`   | Reloads the current renderer and returns at boot-ready                       |
| `navigate()` | Prepares an attempt for a new source/ref/context and returns at boot-ready   |

Before reloading a parent or ancestor, check that you have the right target:

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

Lifecycle methods that wait for readiness return `PanelObservation` values.
`phase: "ready"` means both host navigation and application bootstrap finished.
Failures throw `PanelOperationError` with the same provenance fields. Creating a
slot is committed and observable immediately, while runtime preparation
continues in the background, so one broken panel cannot hold up the panel tree.
`openPanel` waits on the server-minted attempt through `awaitAttempt` without
polling: it returns on the first ready observation, rejects terminal failures
immediately, and otherwise waits until the caller cancels. Pass a stable
`operationId` so a retried creation reaches the same slot; do not combine it
with `slug`. See [PANEL_API.md](PANEL_API.md#the-completion-contract) for the
full creation and activation sequence.

9. Adjust running state without reopening:

```ts
await scope.myAppPanel.stateArgs.patch({ theme: "dark", mode: "fixture" });
await scope.myAppPanel.setMode("fixture");
```

## Managing child panels

From agent eval, use the paged `panelTree.roots()` and `panelTree.children()`
reads. `roots({ limit })` covers only the verified caller's roots; for other
owners, use `rootOwners()` and `rootsForOwner(ownerUserId, ...)` (visibility is
the same). Archive stale children explicitly, and do not load the entire tree.

```ts
import { panelTree } from "@workspace/runtime";

const roots = await panelTree.roots({ limit: 100 });
for (const { node, handle } of roots.entries) {
  console.log(node.childCount, handle.id, handle.title);
}

const page = await panelTree.children(scope.myAppPanel.id, { limit: 100 });
for (const { handle } of page.entries) {
  console.log(handle.id, handle.kind, handle.source);
}
await page.entries[0]?.handle.archive();
```

Reuse an existing handle instead of opening a duplicate. A handle's scalar
fields hold the last observed values; call `handle.observe()` when live state
matters. Keep the handle in eval `scope`; it survives warm cells and kernel
restarts alike. Bind temporary inspection, browser, diagnostic, and child
panels with `await using panel = await openPanel(...)` so they are archived when
the cell exits, even on failure.

## Browser panels

URLs also open with `openPanel`:

```ts
import { openPanel } from "@workspace/runtime";

const sitePanel = await openPanel("https://example.com", { focus: true });
try {
  const session = await sitePanel.cdp.session();
  const page = session.page;
  await page.title();
  await session.close();
} finally {
  await sitePanel.archive();
}
```

CDP automation is under `handle.cdp`. `openPanel()`, `focus()`, `navigate()`,
`reload()`, and `rebuild()` already wait for boot readiness; there is no
separate lease or load step on the handle.

## Verification

Use `handle.snapshot()` for an agent-readable view with provenance, and read its
`document` field. Use `handle.tree()`, `handle.state()`, and `handle.routes()`
for deeper inspection. Typecheck before launching unless the change is a small
text edit.

A ready lifecycle and a correctly rendered panel are different things.
`openPanel()`, `rebuild()`, and `observe()` can report `phase: "ready"` as soon as
the attempt has booted, but creating, forking, opening, rebuilding, debugging,
or polishing a panel is not done until you have captured and inspected a
matching `snapshot()`. Return the observation and snapshot together so their
`panelId`, `attemptId`, `runtimeEntityId`, and `buildKey` can be matched. If the
snapshot is blank, shows the boot-error shell, or lacks the intended behavior,
diagnose and fix it; never report the ready phase alone as success.

For runtime failures, start with the narrowest source of logs:
`handle.diagnose()` for the observation plus bounded renderer evidence,
`runtime.supervision.health(identity)` for the state of a specific live
entity, and `serverLog` for host behavior. The `serverLog` service and
`skills/server-logs/SKILL.md` live in the System workspace. For a normal panel,
read its diagnostic packet before switching to System for host logs.

Tie every verification result to the build and state it ran against. If the
runtime looks unchanged, check the active build ref and follow the expected work
unit, application, event, and publication instead of repeating the edit.

## Forking existing projects

Fork with the workspace-dev helpers rather than copying a directory. Do a dry
run to review the metadata and class renames, then apply the fork as one work
unit:

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
always target `workers/` or `panels/`, so even a dry run plans a destination
there; `dryRun: true` guarantees nothing is written. Use the generic
`forkProject({ from, to, projectType })` only for deliberate advanced cases.
Forking into a different project type is rejected unless `projectType`
explicitly allows it.

Apply a panel fork and store each step's result in `scope`:

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

If eval rejects, an applied fork is not rolled back. If opening, observing, or
taking a snapshot fails, continue from the receipt or handle in `scope` and
retry only that step. `snapshot()` returns a structured capture object, not a
string, so do not call `slice()` or other string methods on it.

Every panel and worker in the workspace is continuously tested against the same
fork preflight. A dry-run failure therefore means real source or manifest drift
or a bug in the platform analyzer; do not add a bypass for it.

For workers with several Durable Object classes, pass an explicit `classMap`.
After applying, check the returned working head and work unit, run the build,
commit the complete chain, publish, then launch the intended build.

Use the VCS file-copy batch when the operation really is just copying managed
files, with source and content-mapping provenance. Use a fork operation when
package metadata, runtime registrations, class names, and other dependent parts
must change together. Neither infers what belongs together from the selected
paths or from content similarity.
