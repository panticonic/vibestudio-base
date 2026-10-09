# Panel API

Panels, initialized plain workers, and server-side eval import the panel APIs
from `@workspace/runtime`. Durable Objects instead use the instance methods on
`PanelDurableObjectBase` from `@workspace/runtime/worker/panel-durable-base`,
because module-level runtime clients are not bound to an object. Both forms
follow the same completion rules.

## The completion contract

The panel operations behave as follows:

- `await createPanelSlot(...)` commits the new slot and returns its durable
  handle. It does not request a presentation lease or wait for activation,
  build, or boot, and the panel stays unloaded until something presents or
  inspects it. Use it for navigation workflows where the caller may not live
  as long as the panel build takes. `CreatePanelSlotOptions` deliberately has no
  `focus` option and nothing else that affects readiness.
- `await openPanel(...)`, `focus()`, `navigate()`, `reload()`, `rebuild()`, and
  `snapshot()` return only once the selected runtime attempt is application
  **boot-ready**. `focus: false` only suppresses presentation; `openPanel`
  still waits for readiness. The wait has no fixed deadline; use
  `options.signal` to cancel it.
- None of these counts a lease, a registered WebContents/CDP target,
  `about:blank`, or a generated HTML shell as success.
- A resolve, build, host, navigation, bundle, or entry failure rejects with
  `PanelOperationError`. A panel id or an empty snapshot does not mean success.
- `snapshot()` returns a capture tied to the attempt it read.

### How creation proceeds

Creation happens in two steps. First the slot is committed to the panel tree
and is immediately observable. Then build preparation, host assignment,
navigation, and application boot move it through its phases. This way a slow
or broken new panel cannot block tree discovery, owner seeding, or creation of
other panels. `createPanelSlot(...)` returns after the first step;
`openPanel(...)` also waits for its own attempt to reach `ready`. It observes
readiness once and then follows that server-minted attempt through
`awaitAttempt`: a ready observation resolves without sampling again, and a
failed or stopped observation rejects immediately.

Activating execution is separate from presenting the panel. Committing a code
panel's slot records a level-triggered intent; the server's execution
reconciler activates the reserved runtime entity, retries transient failures,
and resumes `preparing` reservations after a restart. `createPanelSlot(...)`
does not wait for this. `openPanel(...)` joins the same idempotent activation,
then materializes the panel and waits for boot, so it reports activation
failures while keeping the slot it already committed. Materialization has to
follow activation, because connection grants need the panel principal that
activation registers. Activation does not allocate a renderer, and presentation
reconciliation only advances an existing lease; it never makes an unloaded
slot resident.

Operations that wait for readiness first make sure the panel is presented. For
programmatic runtimes they call the idempotent `panelRuntime.ensureSlot`
transition, which prefers the headless CDP host and falls back to a CDP-capable
desktop host. A native desktop focus bridge holds its own local lease instead,
so a UI focus request does not move the panel to headless just to observe it.
`unload()` releases the presentation lease but keeps the slot and runtime
entity; the next `focus()`, `openPanel()` wait, navigation, reload, rebuild,
snapshot, or CDP operation can materialize the panel again. `observe()` is
read-only: it reports the current attempt and route without acquiring
anything.

These states can legitimately combine: a committed slot may have no lease; a
host holding a lease may have no view while it materializes; and a lease that
is reconnecting may be briefly unreachable while its attempt stays ready. A
mobile lease is a valid visible presentation but cannot serve programmatic
inspection, so programmatic operations that wait for readiness fail
immediately with `host_unavailable`. A host materialization failure is reported
as a terminal host failure rather than left pending, and a later ensure can
retry the failed host incarnation. Terminal build, host, load, and boot states
reject immediately with host evidence, a diagnostic id, and the full attempt
provenance, never with a handle to a blank panel. Preparation has no renderer
and is never inferred from elapsed time; activation is the step that lets a
host create the real renderer.

This is stricter than the browser's "load" state. The generated panel bootstrap
reports `loading → booting → ready` and reports entry errors, unhandled
rejections, missing assets, and incomplete runtime configuration as failures.

```ts
import { openPanel, PanelOperationError } from "@workspace/runtime";

try {
  const panel = await openPanel("panels/my-app", {
    focus: true,
    contextId: ctx.contextId,
  });
  const observation = await panel.observe();
  const capture = await panel.snapshot();
  console.log(observation.buildKey, capture.document.text);
} catch (error) {
  if (error instanceof PanelOperationError) {
    console.error(error.failure.code, error.failure.stage);
    console.error(error.failure.message, error.failure.provenance);
    console.error(error.errorData.recovery);
  }
  throw error;
}
```

`PanelOperationError.errorData.recovery` says how to retry. Failures you can fix
in source or the build report `repair-and-rebuild`; runtime and host failures
report `observe-and-reacquire`. Do not just repeat the same lifecycle call.

## Discovery and creation

```ts
panelTree.self(): PanelHandle
panelTree.get(id): PanelHandle
panelTree.roots(input?): Promise<PanelRuntimeTreePage>
panelTree.rootOwners(input?): Promise<PanelRuntimeTreeRootOwnerPage>
panelTree.rootsForOwner(ownerUserId, input?): Promise<PanelRuntimeTreePage>
panelTree.children(parentSlotId, input?): Promise<PanelRuntimeTreePage>
panelTree.page(input): Promise<PanelRuntimeTreePage>
panelTree.walk(rootSlotId, { limit }): AsyncIterableIterator<PanelRuntimeTreeWalkEntry>
panelTree.path(id): Promise<PanelRuntimeTreePath | null>
panelTree.search(input): Promise<PanelRuntimeTreeSearchPage>
panelTree.parent(id): PanelHandle | null
panelTree.navigate(id, source, opts?): Promise<PanelObservation>
createPanelSlot(source, opts?): Promise<PanelHandle>
openPanel(source, opts?): Promise<PanelHandle>
```

`PanelHandle.id` is the slot id in the panel tree and equals
`PanelTreeNode.slotId`; handles have no separate `slotId` property. Archiving
that id removes the panel's subtree, whereas closing a CDP page only
disconnects the automation client.

The discovery methods are paged and return page objects, not arrays:

```ts
type PanelRuntimeTreeRootOwnerPage = {
  revision: number;
  owners: Array<{ ownerUserId: string | null; rootCount: number }>;
  nextCursor: string | null;
};

type PanelRuntimeTreePage = {
  revision: number;
  group:
    | { kind: "roots"; ownerUserId: string | null }
    | { kind: "children"; parentSlotId: string };
  entries: Array<{ node: PanelTreeNode; handle: PanelHandle }>;
  nextCursor: string | null;
};

type PanelRuntimeTreeSearchPage = {
  revision: number;
  hits: Array<{
    entry: { node: PanelTreeNode; handle: PanelHandle };
    ancestors: Array<{ node: PanelTreeNode; handle: PanelHandle }>;
    ancestorsTruncated?: boolean;
  }>;
  nextCursor: string | null;
};
```

If a creation request may be delivered more than once, pass the same non-empty
`operationId` on every attempt. The operation's identity also includes
`source`, `contextId`, `parentId`, and `ref`, so reusing an operation id for a
different open cannot return the original slot. An identical retry resumes the
committed slot, including after an ambiguous transport failure. `slug` and
`operationId` cannot be combined, because each one defines the slot's stable
identity.

- `self()` and `get()` build handles synchronously without I/O.
- `roots({ limit })` returns the verified caller's own root panels. The host
  derives ownership; do not supply an `ownerUserId`.
- For panels owned by another member, or by nobody (the workspace band), call
  `rootOwners()` and then `rootsForOwner(ownerUserId, input?)`. Visibility is
  the same as for your own roots.
- Use `children()`, `path()`, and `search()` to navigate to a specific panel.
  `page()` reads a sibling group you specify directly. There is no call that
  reads the whole tree or all siblings at once.
- Follow `nextCursor` only while the page `revision` is unchanged; if it
  changes, restart the group from its first page.
- To visit a subtree, iterate `walk(rootSlotId, { limit })`. It yields
  `{ node, handle, depth }` breadth-first, follows cursors, and restarts on a
  revision change without yielding a slot twice. Receiving `limit` entries
  means the subtree may hold more.
- The handle's `id`, `title`, `source`, `kind`, and `parentId` fields hold the
  last observed values. Call `observe()` whenever you need live runtime state.
- `search({ query })` takes plain text and matches indexed titles, source
  paths, manifest descriptions and dependencies, tags, and keywords.
  Punctuation separates terms and has no query syntax, so a copied title such
  as `vibestudio | Trello` is a valid query. Results include committed slots
  whose runtime is not ready yet.

Root groups describe who created a panel; they do not control access. A root
whose `ownerUserId` is the current user appears under **Your panels**, an
ownerless root under **Workspace**, and other members' roots under that member.
Children stay attached to their parent whoever created them. All groups are
visible to the whole workspace unless a separate authority policy restricts
them.

```ts
let cursor: string | undefined;
do {
  const page = await panelTree.children(parentSlotId, {
    ...(cursor ? { cursor } : {}),
    limit: 100,
  });
  for (const { node, handle } of page.entries) {
    console.log(node.childCount, handle.id, handle.title);
  }
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

A panel's code builds from its own context (`ctx:<its contextId>`) unless
`ref` names other code, such as `"main"`. To run the unpublished code of the
current context and pick up its later edits on rebuild, share that context:

```ts
const panel = await openPanel("panels/my-app", { contextId: ctx.contextId });
```

If you omit `contextId`, reserving the panel creates a new context forked from
the verified creator's current working state, and records it as a lifecycle
child of the creator's context. The panel runs the creator's code as of the
fork; later edits in the creator's context do not reach it. The creator can then
inspect, automate, rebuild, or archive the panel without approval for a foreign
context, and destroying the creator's context also retires the panel's
context. When an installed extension creates the panel, the extension acts as
the lifecycle deputy, while the host-verified root initiator owns the new
context and supplies its human attribution. Ownership never comes from
extension input; there is no owner or parent field for callers to set.

Passing an explicit `contextId` shares that existing context and does not
re-parent it. Use it for running a context's working code and for
applications that are meant to share storage. Omit it to give the panel its own
isolated context.

If you do not pass `parentId`, the server finds the open tree slot that
corresponds to the caller's runtime lineage. Pass `parentId: null` for a root
you own, or an open slot id to choose the parent yourself.

## Host commands

Use host commands for secondary panel actions that belong in the application
chrome. The panel declares its commands once, and each host presents them in
its own way: desktop adds them to its command palette, mobile shows them as
native panel actions. Do not render an extra mobile-only header in the panel to
expose the same actions.

In React panels, use the hook from `@workspace/react`:

```tsx
import { useMemo } from "react";
import { useHostCommands } from "@workspace/react";
import type { HostCommand } from "@workspace/runtime";

function TaskPanel({ canRefresh }: { canRefresh: boolean }) {
  const commands = useMemo<HostCommand[]>(
    () => [
      { id: "task-new", label: "New task", group: "Tasks" },
      ...(canRefresh
        ? [
            {
              id: "task-refresh",
              label: "Refresh tasks",
              description: "Reload from the task service",
              group: "Tasks",
            },
          ]
        : []),
    ],
    [canRefresh],
  );

  useHostCommands(commands, (commandId) => {
    if (commandId === "task-new") openNewTaskDialog();
    if (commandId === "task-refresh") void refreshTasks();
  });

  return <TaskList />;
}
```

`HostCommand` fields:

| Field           | Meaning                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`            | Required. Stable machine id, unique among this panel's commands. Do not derive it from translated or changing copy. |
| `label`         | Required. Short action label describing what the command does, not where a host shows it.                           |
| `description`   | Optional supporting text. A host may shorten or omit it when space is tight.                                        |
| `group`         | Optional section label. A host may group, flatten, or omit sections to fit its own interaction model.               |
| `args`          | Optional ordered arguments the host prompts for before running (`string`, `enum`, `number`, or `url`).              |
| `requiresFocus` | Optional. Offer the command only while this panel is focused.                                                       |
| `danger`        | Optional. Destructive: hosts use their danger tone and never auto-run it.                                           |

Each registration owns its own commands. Any component may call
`useHostCommands`; the host shows the union of every live registration in the
panel, a selection reaches only the registration that owns its id, and
unmounting removes only that registration's commands. Command ids must be
unique across the panel: registering an id another registration already owns
throws. To disable an action, leave it out of the current set; there is no
separate enabled flag.

The hook re-registers when command metadata changes and always calls the
latest handler. Memoize command arrays derived from state so it is clear when
they change. Not every host shows commands: headless and test hosts may show
nothing, so essential workflows must also work from the panel content or the
panel's programmable API.

Non-React panel code registers commands with their handler and keeps the
returned disposer:

```ts
import { panel, type HostCommand } from "@workspace/runtime";

const commands: HostCommand[] = [
  { id: "task-refresh", label: "Refresh tasks", group: "Tasks" },
];
export const dispose = panel.registerHostCommands(commands, (commandId) => {
  if (commandId === "task-refresh") void refreshTasks();
});
```

Host commands are temporary UI state local to the host. They go only to the
shell displaying the panel and never become a server service, stored state, a
broadcast to other panels, or a notification. The panel decides command ids,
labels, which commands are currently available, and what each one does. The
host handles keyboard and touch presentation, placement, accessibility, and
sending the selected id back to the same panel. Do not add chat-, terminal-, or
other feature-specific branches to generic shell code. If desktop and mobile
need different controls for the same action, share the panel behavior and make
only the renderers host-specific.

In tests, capture the `useHostCommands` arguments, assert the current command
set and its ids, call the captured handler, and check the panel's action. Shell
routing tests belong to the host; they should show that every
`target: "shell"` envelope stays local and cannot fall through to a
server-backed panel session.

### Handing the user to the panel's agent

This is the reverse of a host command: a panel can open the shell's command
overlay for itself, optionally with the compose box pre-filled. Nothing is sent
for the panel; the user reads the text and presses send.

```ts
import { panel } from "@workspace/runtime";

await panel.openCommandAgent({
  prompt: "Make the due-date column sortable, then rebuild this panel.",
});
```

This calls the open host method `app.openShellSurface(target)` (also available
as `panel.openShellSurface(target)`). Its targets are:

| Target                                                 | Opens                                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ kind: "command-agent", panelId?, mode?, prompt? }`  | The command overlay for a panel (the focused panel if `panelId` is omitted). The shell focuses that panel first so all three agree.             |
| `{ kind: "about", page }`                              | An About page by id (`permissions`, `credentials`, `automations`, …)                                                                            |
| `{ kind: "panel-command", panelId, commandId }`        | A host command that panel contributed, routed the same way as a palette selection                                                               |
| `{ kind: "problem-report" }`                           | The problem report surface                                                                                                                      |
| `{ kind: "settings", section?, workspaceId? }`         | Settings; `section` is one of `problem-reporting`, `connection`, `devices`, `profile`, `appearance`, `apps`, `hosts`, `templates`, `workspaces` |
| `{ kind: "workspace-chooser", template?, sourceUrl? }` | The workspace chooser                                                                                                                           |

`"settings"` and `"workspace-chooser"` can also be passed as bare strings.

`panel.describeShellSurfaces()` lists the kinds the current host can open;
offer only those instead of trying each one. Hosts without shell chrome (the
headless server and some clients) reject `openShellSurface`. Treat that as an
unavailable feature, not a panel failure.

Each target also has a deep link that opens it from outside a session.
`createShellSurfaceLink(target)` in `@vibestudio/shared/shellSurface` produces
`vibestudio://ask?…`, `vibestudio://about?…`, `vibestudio://command?…`, or
`vibestudio://surface?…` (or the equivalent `https://vibestudio.app/…` share
link). Panels with state are reached through the related
`vibestudio://panel?source=…` link (`@vibestudio/shared/panelLocation`).

## One observation model

`await handle.observe()` is the cheap status read:

```ts
interface PanelObservation {
  panelId: string;
  title: string;
  source: string;
  kind: "workspace" | "browser";
  parentId: string | null;
  contextId: string;
  requestedRef: string;
  runtimeEntityId: string | null;
  attemptId: string; // opaque coordinator-minted identity
  attemptRef: { epoch: string; attemptId: string };
  effectiveVersion: string | null;
  buildKey: string | null;
  phase: "pending" | "loading" | "booting" | "ready" | "failed" | "stopped";
  failure?: PanelRuntimeFailure;
  host?: {
    holderLabel?: string;
    platform?: "desktop" | "headless" | "mobile";
    supportsInspection?: boolean;
    reachable?: boolean;
    view: { exists: boolean; url?: string; loading?: boolean };
    boot:
      | { kind: "unavailable" }
      | {
          kind: "observed";
          observation: {
            phase: "loading" | "booting" | "ready" | "failed";
            runtimeEntityId?: string | null;
            source?: string | null;
            contextId?: string | null;
            effectiveVersion?: string | null;
            buildKey?: string | null;
            message?: string;
            errorName?: string;
            stack?: string;
            failureStage?: "config" | "bundle-load" | "entry";
          };
        };
  };
  updatedAt: number;
}
```

The boot phase belongs to the attempt, while `host.reachable` describes the
current transport route. A reconnect can therefore change reachability without
resetting an attempt that is already ready, and without waking callers waiting
on that attempt. Every new materialization gets a new attempt, even when it
shows the same runtime entity and build key.

Every renderer host that supports inspection must implement the
`panelObservation` host command. Desktop and headless hosts publish the same
`PanelHostObservation` value (including the nested `view` and `boot` states).
Both run the same bounded page probe for `document.readyState`, the current
URL, and `globalThis.__vibestudioPanelBoot`, and parse the result with the same
shared schema. Target registration, successful navigation, an empty DOM, or an
existing browser view never counts as readiness. A missing command or malformed
observation is a `host_unavailable` platform failure that must be fixed in the
host; callers must not assume success or fall back to another readiness check.

Handles have no `refresh()`, `getInfo()`, `ensureLoaded()`, or `isLoaded()`.
Those older methods each reported part of the state and could report success
for a broken panel. Use `observe()`; only `phase === "ready"` means ready.

## Failures

Read `error.failure` instead of matching message text:

```ts
interface PanelRuntimeFailure {
  code:
    | "unit_not_found"
    | "ref_not_found"
    | "manifest_invalid"
    | "dependency_resolution_failed"
    | "compile_failed"
    | "build_identity_invalid"
    | "host_unavailable"
    | "lease_conflict"
    | "navigation_failed"
    | "asset_unavailable"
    | "asset_transport_failed"
    | "entry_threw"
    | "boot_stalled"
    | "render_crashed"
    | "panel_not_found"
    | "unknown_failure";
  stage: "resolve" | "build" | "host" | "load" | "boot" | "runtime";
  message: string;
  diagnosticId: string;
  occurredAt: number;
  provenance: {
    panelId?: string;
    runtimeEntityId?: string | null;
    attemptId?: string;
    source: string;
    contextId: string;
    requestedRef: string;
    effectiveVersion?: string | null;
    buildKey?: string | null;
  };
  details?: Record<string, unknown>;
}
```

The failure and the error shown in the shell come from the same observation. If
an operation rejects, do not immediately retry or open another panel; read the
failure first. Retrying cannot fix a missing unit, a wrong ref, a compile
error, or an entry module that throws.

## Handle operations

| Member                                          | What it does                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `observe()`                                     | Current attempt, phase, host state, provenance, and structured failure                                              |
| `diagnose()`                                    | One bounded packet with `observation`, past console and lifecycle records, and a document if ready                  |
| `snapshot(opts?)`                               | Document capture of a boot-ready panel with `panelId`, `attemptId`, `runtimeEntityId`, `buildKey`, and `capturedAt` |
| `navigate(source, opts?)`                       | Prepares and activates an attempt for a new source/ref/context, then waits for ready                                |
| `rebuild(opts?)`                                | Prepares a new immutable attempt for the current source/ref without a history entry, then waits for ready           |
| `reload(opts?)`                                 | Reloads the current view and waits for its boot handshake                                                           |
| `focus(opts?)`                                  | Assigns and presents the panel, then waits for ready                                                                |
| `children()` / `parent()`                       | Tree relationships                                                                                                  |
| `stateArgs.get()` / `stateArgs.patch()`           | Validated, host-stored application state args                                                                       |
| `archive()` / `unload()`                        | Removes the panel subtree / releases the live runtime                                                               |
| `tree()` / `state()` / `routes()` / `setMode()` | Optional inspection through the application's `_agent` API                                                          |
| `cdp.session()`                                 | Stable generation-fenced CDP session and Playwright-style page                                                      |
| `click(selector)`                               | Click through the panel's CDP session; requires approval                                                            |

`navigate()`, `reload()`, `rebuild()`, and `focus()` return
`Promise<PanelObservation>`, not a new `PanelHandle`. Keep using the original
handle for `observe()`, `snapshot()`, and later lifecycle calls:

```ts
const observation = await handle.rebuild();
const capture = await handle.snapshot();
```

Code metadata and runtime creation use the same ref: an explicit navigation ref
wins; otherwise the destination panel's context decides which code runs.
Rebuild keeps the panel's own context and explicit ref, not the context of the
agent inspecting it.

All methods that wait for readiness accept `{ signal?: AbortSignal }`;
`navigate()` and `focus()` take it in their existing options object.
Cancelling stops the caller's wait. It does not undo a creation or destroy a
panel whose commit may already have succeeded.

`navigate()` and `rebuild()` replace the panel atomically: the new runtime and
build are prepared before the current history entry is replaced, so a
preparation failure leaves the old attempt in place. The panel-tree id and
handle stay the same, while the runtime entity, build key, and CDP endpoint
belong to one incarnation. For multi-step automation, keep one `cdp.session()`
and keep using the same `session.page`; the next awaited operation rebinds the
stable page to the current generation without replaying an interrupted action.
Read `session.receipt` for acquired, reconnected, or replaced status.

## Snapshot provenance

```ts
const capture = await panel.snapshot();
// {
//   panelId,
//   attemptId,
//   runtimeEntityId,
//   buildKey,
//   capturedAt,
//   document: { kind: "synth", text, structure }
// }
```

Read `capture.document`, not the top-level fields. The ids let you tell this
capture apart from one taken after a later rebuild or navigation.

## Diagnostics

When something is wrong, make one diagnostic call:

```ts
const packet = await panel.diagnose();
console.log(packet.observation);
if (packet.consoleHistory.available) console.log(packet.consoleHistory.errors);
else console.log(packet.consoleHistory.error);
console.log(packet.document?.document.text);
```

`consoleHistory` has `entries`, `errors`, `dropped`, and `capacity`; there is no
`warnings` array. Get warnings with
`entries.filter((entry) => entry.level === "warning")`.

`diagnose()` works on a failed attempt: it returns the failure and whatever
bounded host evidence exists, without needing a successful snapshot first. For
a live runtime entity, pass its `{ kind, entityId }` identity to
`runtime.supervision.health(identity)` or `runtime.supervision.logs(identity)`.
These reads do **not** trigger a build and do not prove that the current working
source compiles; use
``services.build.getBuildReport(source, `ctx:${ctx.contextId}`)`` for that.
Read server logs only when the panel packet shows the failure is below the
panel lifecycle.

## State and agent inspection

Inside a panel:

```ts
import { panel } from "@workspace/runtime";

const initial = panel.stateArgs.get();
await panel.stateArgs.patch({ theme: "dark" });
```

Patches follow RFC 7386: objects merge recursively, `null` deletes a key, and
arrays and scalars replace their previous value. The state owner serializes
concurrent patches and validates the merged result against the active build.

From a handle:

```ts
await handle.stateArgs.patch({ theme: "dark" });
const next = await handle.stateArgs.get();
```

`handle.state()` is empty unless the application registers state providers with
`useAgentState` or `agentApi.registerStateProvider`.

## CDP

`handle.cdp.session()` returns the stable Playwright-style automation page,
generation-fenced to the owning panel. Keep the session through lifecycle
changes and close it when the workflow ends.
Do not install Playwright. For past diagnostics use `diagnose()`; use
`handle.cdp.consoleHistory()` only when you need a filtered console read. The
active desktop or headless host serves CDP access; it is rejected when a mobile
host, which has no CDP, holds the panel.

In server-side eval, use this handle API directly. The CDP client picks the
runtime's supported WebSocket transport; do not open the panel's private HTTP
URL, build a raw WebSocket, or install another browser library as a fallback.

The page API includes `page.keyboard.press/type/insertText`,
`page.setViewportSize/viewportSize`, `locator.evaluate/evaluateAll`, regex
text and name locators, and form updates that work with React. Browser
callbacks are serialized into the page, so pass outside data as the callback's
explicit argument. Browser evaluation errors keep the real exception
description and stack, and locator failures include the rendered locator. See
[BROWSER.md](BROWSER.md) for the full API.

## Ownership

Bind a temporary panel with `await using panel = await openPanel(...)`; it is
archived with its subtree when the block exits, including on failure. A panel
that must outlive one block (for example, across eval cells) stays in `scope`
and is archived explicitly when the workflow ends. Never bind a handle you did
not create: disposing it archives that panel. Reuse an existing handle instead
of opening duplicates. Leave a panel open only if the user asked to keep it or it
is the deliverable being inspected.
