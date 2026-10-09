# Eval Tool

Run TypeScript/JavaScript **server-side** in your own per-agent sandbox. `eval`
is a LOCAL agent tool: the agent loop dispatches it in-process, and the code
runs in your channel's `EvalDO` (a server-side Durable Object), not in the
chat/editor panel. Console output is captured and the return value is sent
back.

**Eval does not need a connected panel.** It keeps working if the chat/editor
panel, or the user, disconnects. It behaves like a notebook kernel: the same
live heap stays in memory while a run or cancellation is in progress, and for
30 minutes of inactivity afterwards. Every cell renews that idle lease, and
detached work that is still active does not count as inactivity. The in-DO
SQLite `db` and the serializable part of `scope` survive kernel restarts.

Imports and local declarations belong to their cell. To use a live object in a
later cell, save it in `scope` (for example, `scope.phone = await phoneSetup()`)
and then use `scope.phone`. Reimport module helpers where you need them; local
bindings never become globals, even while the heap stays alive.

## Eval Perspective

Eval runs in a server-side EvalDO, not in the visible chat/editor panel, so it
sees the runtime differently from the user's panel:

- `chat.channelId` is the channel where this agent is currently responding.
  It is not the channel of a parent panel, sibling panel, or any other chat
  panel in the tree.
- In eval, `panelTree.self()` is the EvalDO runtime handle. Use top-level
  `getParent()` for the owning agent's nearest visible panel ancestor.
- `openPanel()` from eval places new panels under that ancestor by default,
  when there is one.
- A headless session has no initial panel ancestor. The panel tree still works,
  but a child panel needs a real panel node as its parent. Use `getParent()` to
  check for an owner. If it returns null, create your own root and pass its id
  as `parentId` when opening the child. Bind only the root you created with
  `await using`: it archives that root and its descendants when the cell exits,
  including on failure. An inherited user panel is never disposed.

  ```ts
  import { getParent, openPanel } from "@workspace/runtime";

  const inherited = getParent();
  await using ownedRoot = inherited
    ? null
    : await openPanel("about/new", { parentId: null });
  const root = inherited ?? ownedRoot!;
  // openPanel resolves once the child is ready under `root`.
  const child = await openPanel("about/new", { parentId: root.id, focus: true });
  ```

  For a headless workflow that spans several cells, keep the root in `scope`
  instead and archive it with `await scope.root.archive()` in the cell that
  finishes the workflow.

- When the user refers to "this panel", "the parent panel", or another visible
  panel, inspect the visible tree with bounded `panelTree.roots()`,
  `panelTree.children()`, or `panelTree.search()` reads, pick the target
  panel, and read `await target.stateArgs.get()` to find its
  `channelName`/`channelId` before running channel diagnostics.

  Start root discovery with `await panelTree.roots({ limit: 100 })`; the host
  fills in the current verified owner. Do not use the advanced
  `panelTree.page({ group: { kind: "roots" } })` form, because an explicit root
  group requires an `ownerUserId`. For other owners' panels, use
  `rootOwners()` and then `rootsForOwner(ownerUserId, ...)`.

When it is unclear which panel or channel the user means, render a small panel
tree or channel-health dashboard with `inline_ui` so the user can see and
confirm the target you are inspecting.

## Basic Usage

```
eval({ code: `console.log("hello")` })
```

Workspace packages are built and resolved automatically. To exercise or
inspect a built package, use a normal static import and return only the small
summary you need. The first import builds on demand; later imports use the
cache:

```ts
import * as pkg from "@workspace-skills/workspace-dev";
return { exports: Object.keys(pkg).sort() };
```

Do not search generated build directories or call a separate "import build"
service. For npm packages, declare the npm mapping in the eval tool's `imports`
argument; workspace package specifiers need no mapping. See
[workspace and npm import rules](#imports) for ref-pinned imports and the full
rules.

Eval captures its own console output; no panel, CDP session, or testkit helper
is involved. One eval can log several lines and return a compact summary:

```ts
console.log("line 1");
console.log("line 2");
console.log("line 3");
return { lines: 3 };
```

The tool result contains the captured console text and the return value. Use
the panel's `cdp.consoleHistory()` only when the task is about console messages
produced inside a rendered panel.

For multi-file code, put the entry point in a context-relative file and pass
`path`:

```
eval({ path: ".tmp/eval/check-project.ts" })
```

File-loaded eval reads the entry file from the current context, supports static
relative imports from it, and resolves bare imports from the nearest
`package.json` when one exists. Executable entry files are `.ts`, `.tsx`,
`.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`. When `path` names any other
file, such as `.md`, `.json`, `.yaml`, or `.txt`, eval returns its UTF-8
contents instead of executing it.

Inline `code` normally has no source file. To resolve relative imports, pass
`sourcePath` as a context-relative virtual filename, or pass `path` together
with the inline code as a directory or file hint. The hint only sets the inline
module's location; it does not import or execute that file. When inline code
imports `./index.ts`, use the containing directory or a distinct virtual
filename such as `src/eval-check.ts`; `src/index.ts` would make `./index.ts` a
self-import. The tool rejects unavailable and self imports with the typed
`module_not_available` code before running anything, so you can fix the
importer path; it is not an infrastructure failure. Without inline code, `path`
loads the file as described above. For substantial multi-file work, use a real
entry file.

## Parameters

| Param        | Type                                             | Default                 | Description                                                                                                       |
| ------------ | ------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `code`       | string                                           | —                       | TypeScript/JavaScript code to execute                                                                             |
| `path`       | string                                           | —                       | Code file to execute, text/data file to load, or a source location hint when `code` is also present               |
| `sourcePath` | string                                           | —                       | Virtual context-relative filename for inline code and relative imports                                            |
| `syntax`     | `"javascript" \| "typescript" \| "jsx" \| "tsx"` | `"tsx"`                 | Source syntax                                                                                                     |
| `imports`    | `Record<string, string>`                         | —                       | Packages to build on demand (workspace or npm)                                                                    |
| `timeoutMs`  | positive integer                                 | —                       | Optional wall-clock deadline in milliseconds; omitted means no deadline                                           |
| `authority`  | per-run authority intent                         | adaptive mutable prompt | Narrow this run: an exact `requests` allowlist, read-only effects, pregranted-only execution, or preauthorization |

The table describes the agent tool. Code that calls the server service directly
uses this typed shape:

```ts
await rpc.call("main", "eval.start", [
  {
    runId,
    source: {
      kind: "inline",
      code,
      pathHint: "src/probe.ts",
      syntax: "typescript",
    },
    scope: { key: channelId, lifecycle: "persistent" },
    resultReceiver: { kind: "caller" }, // optional terminal push to the authenticated caller
    authority,
  },
]);
```

For a file entry, use `source: {kind:"context-file", path, syntax?}`. Recovery
and control calls take `scopeKey`, for example `eval.get({runId, scopeKey})`.
No eval argument can name an owner, channel, context, agent, or receiver
runtime; the host derives those from the authenticated caller and its verified
binding.

### Per-run authority

Normally, omit `authority` and let protected operations use the usual approval
flow. Set an authority intent only when the user or the calling workflow asks
you to restrict the run. `pregranted-only` asserts that the required grants
already exist; it is not an unattended mode and does not skip approval. If a
grant is missing, diagnose the refusal. Do not retry as another principal or
widen the requested authority.

An authority intent can only narrow what the caller already has from the
receiver, the installed harness, the verified session, live grants,
relationships, denials, and locks:

```ts
eval({
  code: `return await fs.readFile("README.md", "utf8")`,
  timeoutMs: 30_000, // top-level sibling of authority, never nested inside it
  authority: {
    effects: "read-only",
    approvals: "pregranted-only",
    requests: [
      {
        capability: "fs.read",
        resource: { kind: "exact", key: "README.md" },
      },
    ],
  },
});
```

- Omit `requests` to use whatever authority the caller already has.
- With `requests`, the list is the exact allowlist for the run, so
  `requests: []` denies every protected operation. A capability/resource pair
  not on the list fails with a structured `run-manifest-denied` error, even if
  the user holds a broader grant.
- Never invent a wildcard request such as `workspace:*`. If you do not know
  the exact capability/resource pair and do not need to restrict the run, omit
  `requests`. Otherwise use `help()` or the capabilities skill to find the
  exact pairs.
- `pregranted-only` never opens an approval card.
- `read-only` is enforced by the same dispatcher that handles every host call;
  it is not a separate list of allowed eval methods.
- `preauthorize` takes exact `{service, method, args}` operations and runs the
  host's normal preflight and approval for them, so the approval covers that
  exact prepared call rather than a capability string. Look up the real service
  and method in the live docs first; do not derive method names from the
  user's wording. Preauthorization is not an allowlist: omit `requests` for
  normal acquisition, or list the exact capability/resource pairs you found
  when the run must be restricted. `requests: []` also denies the
  preauthorized operation. A cell can prepare an operation and a later cell can
  execute it; preparing never runs the operation.

The service also keeps a bounded log of run lifecycle events. Interactive
panels subscribe to `eval:run-event` through `events.watch` for live state,
console, progress, authority, cleanup, kernel, and diagnostic records, and call
`eval.events({runId, after, limit})` only to catch up after a reconnect. Agents
get the final result when the tool call completes and do not poll event pages.
Workspace import bundles record their immutable build identity in the EvalDO's
run and module provenance, and are kept from garbage collection until the
kernel is disposed. External npm bundles are not part of the workspace
BuildStore root set.

## Injected Variables

These names are available in eval code. `scope`, `scopes`, `db`, `ctx`, `help`,
`chat`, and `agent` exist only in eval. `rpc`, `fs`, `services`, and `hosts`
are the same portable bindings that panels and workers use; use them directly
or import them from `@workspace/runtime`.

- **`rpc.call(targetId, method, args, options?)`**: portable RPC client, the
  same as in panels and workers. Raw server services use the target `"main"`:
  `await rpc.call("main", "vcs.status", [{ contextId: ctx.contextId }])`. To
  call a specific remote workspace, pass
  `{ destination: { kind: "workspace", workspaceId } }`; without it the call
  stays local.
- **`services`**: shortcut namespace for raw server services.
  `services.<svc>.<method>(...)` is `rpc.call("main", "<svc>.<method>", [...])`,
  even when a runtime binding shares the name: `services.workers` is the raw
  `workers` service, and the bare `workers` binding is the runtime client. Each
  method's server-side policy still applies. Use `help()` to list services and
  `help("workers")` to inspect a runtime binding.
- **`hosts`**: owner-scoped clients for attached hosts.
  `const child = await hosts.attach(attachedHostSessionId)` returns
  `child.services`; call the child's normal methods, such as
  `child.services.eval.start(...)` and `child.services.eval.get(...)`. The
  child applies its own schema and authority checks; there is no special eval
  bridge for development.
- **`fs`**: filesystem scoped to the current context. The EvalDO resolves your
  context, so do NOT pass a contextId: `await fs.readdir("/")`,
  `await fs.readFile("src/index.ts", "utf-8")`.
- **`ctx`**: `{ contextId, objectKey }` for the current eval session.
- **`scope`**: live notebook scope (see below). `scope.x = …` keeps the same
  object across cells while the kernel stays in memory.
- **`scopes`**: management API for the serialized scope snapshots (see below).
- **`db`**: synchronous in-DO SQLite (see below).
- **`chat`**: the full chat API for the current channel: `publish`/`send`,
  custom-message cards, `registerMessageType`, `callMethod`, and so on. Agent
  eval only; see below.
- **`agent`**: inspect and configure THIS agent: `await agent.describe()`,
  `await agent.setModel("provider:model")`, and so on. Agent eval only; see
  below.
- **`help()`**: `await help()` lists services and import guidance;
  `await help("vcs")` returns a compact live method index;
  `await help("vcs.edit")` returns that method's exact schema and typed errors.

```
eval({ code: `
  const files = await fs.readdir("/");
  scope.fileCount = files.length;
  return files.slice(0, 10);
` })
```

### chat (agent eval)

When eval runs **as an agent** (in the agent's own server-side EvalDO), it gets
a `chat` binding for the agent's current channel. It has the same API as
[CHAT_API.md](CHAT_API.md): `chat.send`, `chat.publish`,
`chat.publishCustomMessage`/`chat.updateCustomMessage`,
`chat.registerMessageType`/`chat.clearMessageType`, `chat.callMethod`,
`chat.callMethodByHandle`, `chat.participantByHandle`, `chat.contextId`,
`chat.channelId`, and so on. Everything is published **as the agent**, with
correct `@agent` attribution.

```
eval({ code: `
  await chat.registerMessageType({
    typeId: "status",
    displayMode: "row",
    source: { type: "file", path: "renderers/status.tsx" },
    stateSchema: { type: "object", properties: { phase: { type: "string" } } },
  });
  const { messageId } = await chat.publishCustomMessage({ typeId: "status", initialState: { phase: "starting" } });
  await chat.updateCustomMessage(messageId, { phase: "done" });
` })
```

`chat` is a thin proxy: the EvalDO forwards each call to the agent's DO, which
performs it through its channel and returns the result. `chat.callMethod`
resolves to the result from the participant that received the call, and
`chat.participantByHandle` is async because it fetches the roster over RPC.
`chat.focusMessage` only works in panels and resolves `false` server-side.

`chat.callMethod` and `chat.callMethodByHandle` invoke participant methods in
`chat.channelId`. To inspect an agent or channel, including one behind another
panel (read that panel's channel id from its state args), use the GAD
inspectors and `gad.inspectAgent({ channelId, method })`.

> `chat` exists only in **agent** eval. CLI and panel eval have no channel and
> no `chat`; use `rpc`/`services` to work with a channel there. Components
> rendered in panels (`inline_ui`, `feedback_custom`, action bars) also get a
> `chat` handle; see [CHAT_API.md](CHAT_API.md).

### agent (agent eval)

When eval runs **as an agent**, the `agent` binding lets the agent inspect and
reconfigure **itself**. Configuration is **per agent**, not per channel: one
model, thinking level, approval level, respond policy, and so on, shared by
every channel the agent is in. Changes apply to all of the agent's channels
from the next turn.

```
// Read your own state (identity, resolved config, channels, tools, native execution):
const me = await agent.describe();
me.config.model;        // the model you are running
me.channels;            // every channel you're a member of
me.execution;           // this channel's native tasks, inputs, and live status

// Reconfigure yourself (each returns the updated config):
await agent.setModel("openai:gpt-5.3");
await agent.setThinkingLevel("high");
await agent.setApprovalLevel(2);          // UX convenience; sensitive ops are gated by app approvals
await agent.setRespondPolicy("mentioned-or-followup");
await agent.setRespondFrom(["@alice"]);   // handles resolve per-channel
await agent.configure({ model: "…", thinkingLevel: "medium" });  // batch
```

The agent's own advertised participant methods are deliberately not available
as model tools: calling the active turn back through its channel would make it
wait on itself. Use `agent.describe()` to inspect yourself, and
`chat.callMethod(...)` only for other participants.

A Pi child started with `spawn_subagent` inherits the parent's effective model
and other runtime settings. For normal delegation, omit its `config`; do not
read the model ref and pass it back. Set `config.model` only when you want the
child on a different model, using an exact ref from the current catalog.

An independent headless agent created directly is different: its model comes
from the entity's creation config (`stateArgs.agentConfig.model`), not from a
later subscription.

> `agent` exists only in **agent** eval, like `chat`. The EvalDO forwards each
> call to your own vessel, which accepts calls only from your own eval.

## Top-level Await

Top-level `await` works. Async operations are tracked and awaited:

```
eval({ code: `
  const response = await credentials.fetch("https://api.example.com/data");
  const data = await response.json();
  console.log(data);
  return data;
`
})
```

Eval deliberately has no global `fetch`. Use `credentials.fetch` for external
HTTP: the request keeps the verified eval session, goes through the egress
proxy, and can pause for approval of the exact origin. It also works for public
endpoints without a stored credential.

A trailing async IIFE is also awaited and used as the eval result:

```ts
(async () => {
  const status = await vcs.status({ contextId: ctx.contextId });
  const files = await vcs.listFiles({
    state: status.workingHead,
    repositoryId: "repository:example",
    limit: 50,
  });
  return files.files;
})();
```

Do not start background work with `void (async () => { /* ... */ })()`. A
detached promise is not recorded in the journal and loses the eval's
permissions. Work that must outlive the eval has to be persisted by a queue or
workflow that resumes it in a later run. Otherwise, await it so its result or
failure belongs to this run.

## Console Output

`console.log/warn/error/info/debug` output is captured during the run and
returned in the result's `console` field.

This is only the eval run's own output. To debug the workspace server process,
query `services.serverLog.tail/query/stats` from eval, or open the
`about/server-logs` viewer to follow it live. See `../server-logs/SKILL.md`.

## Result Shape

The `eval` tool returns
`{ success, console, returnValue?, error?, operationJournal?, scopeKeys?, kernel? }`:

- `success`: whether the run completed without throwing.
- `console`: captured console output. Oversized output is windowed in the
  result; a bounded copy is saved as `scope.$lastLargeConsole`.
- `returnValue`: the `return` value (or last expression), safely serialized.
  An oversized value may be replaced by a truncation summary that points to
  `scope.$lastLargeReturn`.
- `error`: present on failure.
- `operationJournal`: receipts for native operations this eval performed,
  kept separately from the return value and including operations that
  completed before a later exception. Interaction entries record the action,
  target identity, and observed effect, not the full DOM inspection.
  `truncated: true` marks an incomplete journal. See
  [browser receipts](../workspace-dev/BROWSER.md#page-surface) for assertions
  and recovery. Never repeat a mutation just to fill in a journal.
- `scopeKeys`: the keys currently in the live notebook `scope`.
- `kernel`: notebook kernel metadata: the kernel instance ID, start time,
  current idle-lease deadline, and, on the first result after a start, a
  `started` or `restarted` event listing exactly which keys were restored or
  lost.

After a restart, the formatted tool result begins with `[kernel] Restarted`.
Act on that line: module singletons and all live-only objects are gone. It
lists every scope key restored from the snapshot and every live-only key that
was lost. Panel, worker, and DO handles and CDP sessions in scope are restored
by id; rebuild any other lost live object before continuing.

Non-serializable values (functions, symbols, circular references) are converted
to strings in `returnValue`.

The most recent defined return value is also kept as `scope.$lastReturn` for a
follow-up eval. Small values keep their structure; oversized values are stored
as a bounded JSON/text string. A large return is also kept in
`scope.$lastLargeReturn`, which, unlike `$lastReturn`, is not overwritten by the
small results of follow-up inspection cells. Large console and error text go to
`$lastLargeConsole` and `$lastLargeError` in the same way. Each slot holds only
the latest large value of its kind, so you can page through it without output
piling up. `$lastLargeReturn` is JSON/text, not the original object: slice or
search the text, or call `JSON.parse(scope.$lastLargeReturn)` before accessing
properties if the original was JSON-serializable.

Eval results are always bounded, so a huge return cannot leave the turn stuck
in `eval:pending`. For large data, return a compact summary and keep the full
value in `scope`, `db`, or `blobstore` for later paging or grep.

## Imports

Load npm packages through the `imports` parameter; workspace packages resolve
automatically. Then use a normal `import`. Both static `import` and dynamic
`await import(...)` work. They compile to the EvalDO's per-owner `require`, so
your loaded modules never leak into another agent's EvalDO in the same isolate.

Local variables and import bindings belong to one eval call. Import functions
in every call that uses them, and save results and runtime handles in `scope`
when a later call needs them. Imported modules stay cached for the owner, so
reimporting an unchanged package reuses its build.

Do NOT import the **ambient-only** globals (`scope`, `scopes`, `db`, `ctx`,
`help`, `chat`, `agent`, `automations`). They are injected variables, not
module exports, and eval rejects importing them.

`rpc` and `fs` are both injected **and** exported by `@workspace/runtime`, so
you may import them. The imported and injected bindings are the same clients:
`rpc.call(targetId, method, args, options?)` and the context-scoped `fs`.

### Importing the runtime surface

`@workspace/runtime` can be imported in eval and exposes the **same portable
API** as in panels and workers, so the same code runs everywhere:

```
eval({ code: `
  import { vcs, workspace, gad, credentials, openPanel, panelTree } from "@workspace/runtime";
  const status = await vcs.status({ contextId: ctx.contextId });
  console.log("Exact working state:", status.workingHead);
` })
```

<!-- BEGIN GENERATED: eval-importable -->

Importable members (generated from `EVAL_IMPORTABLE_KEYS` in `runtimeSurface.eval.ts`): `PanelOperationError`, `id`, `contextId`, `rpc`, `fs`, `callMain`, `getParent`, `getParentWithContract`, `doTargetId`, `createDurableObjectServiceClient`, `gatewayConfig`, `gatewayFetch`, `openExternal`, `createPanelSlot`, `openPanel`, `getPanelHandle`, `workers`, `workspaces`, `workspace`, `credentials`, `browserData`, `git`, `vcs`, `gad`, `images`, `missions`, `blobstore`, `webhooks`, `extensions`, `templates`, `notifications`, `problemReports`, `panelTree`, `services`, `hosts`, `runtime`.

<!-- END GENERATED: eval-importable -->

See [RUNTIME_API.md](RUNTIME_API.md) for each member's description.
`gatewayFetch` only reaches the **gateway**; use `credentials.fetch` for
external requests.

#### CDP (Chrome DevTools Protocol) from eval

Eval can drive a live panel's browser target over CDP, with full commands
**and** events. Get the endpoint from a panel handle, then connect with
`CdpConnection` from `@workspace/cdp-client`:

```
eval({ code: `
  import { CdpConnection } from "@workspace/cdp-client";
  const handle = getPanelHandle("<panelSlotId>");
  const { wsEndpoint, token } = await handle.cdp.getCdpEndpoint();
  const cdp = await CdpConnection.connect(wsEndpoint, token);
  cdp.on("Runtime.consoleAPICalled", (e) => console.log("panel console:", e.args));
  await cdp.send("Runtime.enable", {});
  const r = await cdp.send("Runtime.evaluate", { expression: "1 + 1", returnByValue: true });
  return r.result.value;
` })
```

### Workspace packages — auto-resolved

Workspace packages (`@workspace/*`, `@workspace-skills/*`) and platform SDK
packages (`@vibestudio/*`) are **built and loaded automatically** when you
import them. Write the import; no `imports` parameter is needed:

```
eval({ code: `
  import { prepareProjects } from "@workspace-skills/workspace-dev";
  return await prepareProjects([{
    projectType: "panel", name: "my-app", title: "My App",
    authority: scope.panelAuthority, authorityReason: scope.panelAuthorityReason,
  }]);
`
})
```

For a new persistent application, use `prepareApplication` instead of this
standalone panel example; it returns an object, not an array. Write the full
authority policy before calling either function: preparation never adds missing
requests and never publishes. Review and verify the candidate, then commit and
push through VCS. See [workspace scaffolding](../workspace-dev/PROJECTS.md).

When a guest or service exception carries structured `errorData`, the eval
result keeps it in its details and shows a bounded preview. If preparation or
a later publication fails, recover with the usual typed VCS status and
receipts; there is no scaffold-specific publication or recovery API. After an
edit with an uncertain outcome, inspect the current state instead of preparing
the same destinations again, and do not infer recovery from the error string.
A failed tool call also stores one `agent-tool-failure.v1` object in the
terminal trajectory event. Branch on its code, kind, stage, retry policy, and
ordered causes, not on the rendered eval text.

The first import builds from the caller's current context working state, which
takes a few seconds. Later imports of the same state use the cached build.

To build a workspace import from another revision, pass a build selector that
the live resolver accepts:

```
eval({ code: `...`, imports: { "@workspace-skills/workspace-dev": "ctx:<contextId>" } })
```

The map value is a build selector, not a package name. Leave workspace packages
out of `imports` to build the caller's current working revision. `main` and
`ctx:<contextId>` are moving selectors. An exact content selector only chooses
what to build; it does not establish semantic ancestry or a basis for
integration. Git branches, tags, and raw SHAs are not workspace build
selectors.

Workspace runtime units build from one exact working state. Managed edits under
`apps/`, `extensions/`, `packages/`, `panels/`, `workers/`, and `skills/`
create semantic VCS changes and write the resulting state to disk. A context
has one committed event and an optional local application head, not one head
per repository. Read [vibestudio-vcs](../vibestudio-vcs/SKILL.md) before you
mutate, compare, commit, or publish source.

### npm packages

Use the `imports` parameter with `"npm:<version>"`, then `import` the package:

```
eval({
  code: `
    import _ from "lodash";
    console.log(_.chunk([1, 2, 3, 4, 5, 6], 2));
  `,
  imports: { "lodash": "npm:^4.17.21" }
})
```

```
eval({
  code: `
    import * as d3 from "d3-array";
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    console.log("mean:", d3.mean(data));
    console.log("deviation:", d3.deviation(data));
  `,
  imports: { "d3-array": "npm:^3.0.0" }
})
```

Versions follow npm semver and range syntax: `"npm:1"`, `"npm:1.3.0"`,
`"npm:^1.0.0"`, `"npm:~2.3.0"`, `"npm:latest"`, or `"npm:*"`. The import-map
key is the package name, so prefer version-only values such as
`imports: { "left-pad": "npm:1.3.0" }`. A package-qualified value like
`"npm:left-pad@1.3.0"` is accepted only when the package name matches the key.

Packages are installed with `--ignore-scripts` (no postinstall hooks).
Specifiers must be standard npm package names; URLs, file paths, and git refs
are rejected. Packages with native addons (`.node` binaries) are not
supported.

Invalid package names or versions, unsupported toolchain packages, and missing
packages or versions are eval failures with stable structured codes that the
caller can fix. They do not end the agent turn: fix the `imports` map or carry
on with other work. Network, cache, package download, and linker failures are
infrastructure failures.

Installed packages and their bundles are cached, so later imports of the same
package and version are fast. The first install of a new package can take
10-30 seconds (npm download plus esbuild bundle); eval waits for it to finish.

For file-loaded code, npm versions are taken from the nearest `package.json`
when possible, checking `dependencies`, `peerDependencies`,
`optionalDependencies`, and `devDependencies` in that order. Use `imports` to
override a version or supply one that is not declared there.

File-loaded code also supports package-local aliases from the `package.json`
`imports` field (`#alias` imports) and simple `tsconfig.json`
`compilerOptions.paths` mappings.

### Mixing workspace and npm imports

Only the npm package needs an `imports` entry. The workspace package builds from
the caller's current working revision; add a `main` or `ctx:<contextId>`
selector only to build it from another revision.

```
eval({
  code: `
    import { prepareProjects } from "@workspace-skills/workspace-dev";
    import Ajv from "ajv";
    const ajv = new Ajv();
    console.log("Ajv loaded:", typeof ajv.compile);
  `,
  imports: { "ajv": "npm:^8.12.0" }
})
```

### Limitations

- `package.json` `exports`, exact lockfile versions, and full Node
  `node_modules` resolution are not implemented.
- Only standard npm package names are accepted (e.g. `lodash`, `@scope/pkg`).
  URLs, file paths, and git specifiers are rejected.
- Packages that need native addons (`.node` binaries) do not work, because
  esbuild cannot bundle them.

## Path Conventions

The `path` parameter for file-loaded eval is always context-relative, for
example `.tmp/eval/check-project.ts`.

Runtime `fs.*` calls are also scoped to the current context folder. In `fs`
calls, `src/index.ts` and `/src/index.ts` both refer to files under the context
root; a leading slash means the context root, not the host filesystem root.
Prefer paths without a leading slash for workspace source, and never pass host
absolute paths such as `/home/user/.../workspace/...`.

## REPL Scope

`scope` is the live notebook heap shared by eval cells in the same channel.
While the kernel is in memory, the EvalDO's in-memory map is the source of
truth: objects are not serialized and rebuilt between calls. Functions, class
instances, handles, and open connections keep their identity and behavior
across cells. Before each cell the host renews the kernel's lease; the
30-minute idle countdown starts once the run and any cancellation have
finished. There is no heartbeat, polling loop, or disconnect at the end of a
cell.

After each cell, the EvalDO also writes a recovery snapshot to its SQLite
`repl_scopes` table. The snapshot is not the live heap and never replaces live
values. It is read only when a new ScopeManager is created after a cold start,
reset, eviction, or rebuild.

### scope vs scopes

- **`scope`**: the live notebook object. Read and write `scope.x` as usual;
  objects keep their identity across cells while the kernel is in memory, and
  serializable state is snapshotted after each cell.
- **`scopes`**: management API for the serialized snapshots in the DB:
  - `scopes.currentId`: the current scope's persistent UUID
  - `scopes.push()`: serialize and archive the current scope, then start a
    fresh one (only serializable values carry over)
  - `scopes.get(id)`: retrieve an archived scope by ID (a deserialized
    snapshot: data only, no functions)
  - `scopes.list()`: list all scopes for this channel with their persisted
    keys and volatile (live-only) keys
  - `scopes.save()`: serialize the scope to the DB now

### Serialization

The recovery snapshot is taken per top-level property:

- **Kept:** primitives, plain objects, arrays, Date, Map, Set, RegExp
- **Kept by identity:** panel handles, worker and DO handles, and CDP sessions
  (`handle.cdp.session()`), anywhere inside the value. Only `{ kind, id }` is
  stored; cold recovery reacquires each one by id with the same authority as
  `getPanelHandle(id)`, never a cached route or lease. A restored CDP session
  binds to the panel's current generation at its first operation.
- **Volatile:** other functions, symbols, class instances,
  WeakRef/WeakMap/WeakSet, circular or shared object references, accessors or
  custom property descriptors, sparse or custom arrays, nesting deeper than 100

If any nested value is volatile, the whole top-level value is left out of the
snapshot. Eval never restores a partial copy without methods under the
original key. A handle whose identity cannot be reacquired is reported lost in
the same way.

So there are two layers:

- **Warm kernel:** every value stays live, including functions and class
  instances.
- **Cold recovery:** serializable data and runtime handles are restored; other
  non-serializable top-level keys are reported as lost and must be rebuilt
  from identifying data.

Keep handles and sessions in `scope` directly; they survive both layers:

```ts
scope.panel = await openPanel("panels/my-app");
scope.session = await scope.panel.cdp.session();

// A later cell, warm or after cold recovery, uses the same names:
return await scope.session.page.getByRole("heading").innerText();
```

Locators, listeners, and other live page objects are not handles; recreate
them from `scope.session.page`.

Nothing is collected at the end of a cell, but the idle window is not
guaranteed either. Code that needs to recover must store stable data instead
of assuming the kernel stays in memory.

### Resetting scope

To start with an empty scope and empty `db`, reset the eval context. The agent
`eval` tool accepts `reset: true`; the reset and the following execution happen
atomically, and repeating the same tool invocation is idempotent. The reset
drops your user `db` tables and the persistent scope before running the
supplied code, keeping only reserved/base tables. Check the effect of the reset
in that call or a later one.

Do not call `eval.reset` through `rpc` from inside eval code. A nested RPC call
is authenticated as the EvalDO, not as the agent that invoked the tool, so it
cannot address the agent's channel sandbox. Agents reset with
`eval({ reset: true, ... })`.

### Deep Mutations

Deep mutations (`scope.data.push(x)`, `scope.config.key = val`) are picked up
by the automatic save after each eval. You do not need to call `scopes.save()`.

## Database Access

`db` is a **synchronous** SQLite database inside the EvalDO. It persists across
calls, turns, and panel disconnects, and is the persistent counterpart to
`scope`.

```
eval({ code: `
  db.run("CREATE TABLE IF NOT EXISTS findings (id INTEGER PRIMARY KEY, note TEXT)");
  db.run("INSERT INTO findings (note) VALUES (?)", "first finding");
  const rows = db.exec("SELECT * FROM findings");
  console.log(rows);
  return rows;
` })
```

- `db.exec(query, ...params)` runs a statement and returns the rows as an array.
- `db.run(query, ...params)` runs a statement for its side effect (no result).
- The reserved tables `state`, `repl_scopes`, and `sqlite_*` reject
  destructive statements (DROP/DELETE/ALTER/UPDATE/INSERT/REPLACE/TRUNCATE/CREATE).
  Use your own table names; you can create and write your own tables freely.

For data that other panels, apps, workers, or agents need to read, define a
worker Durable Object that uses `this.sql`, declare it as a userland service,
and call it over RPC:

```ts
import { rpc, workers } from "@workspace/runtime";

const store = await workers.resolveService("example.todos.v1", "project-123");
if (store.kind !== "durable-object") throw new Error("Expected DO service");
const todos = await rpc.call(store.targetId, "listTodos", []);
```

See [workspace-dev/WORKERS.md](../workspace-dev/WORKERS.md#durable-object-backed-app-databases)
for the full app database pattern. The eval `db` is private to your EvalDO.

## Filesystem Access

`fs` is injected and scoped to your current context; it takes no contextId.
Relative and leading-slash paths are both relative to the context root:
`"note.txt"` and `"/note.txt"` stay inside the context, and a leading slash
never refers to a host filesystem path.

```
eval({ code: `
  const content = await fs.readFile("src/index.ts", "utf-8");
  console.log(content);
` })
```

Pass an encoding such as `"utf-8"` when reading text. Without one,
`fs.readFile` returns bytes, and string methods like `.replace()` fail.

Use `await help("fs")` for the live method list. Common methods include
`readFile`, `writeFile`, `appendFile`, `readdir`, `stat`, `mkdir`, `rm`,
`exists`, `copyFile`, `rename`, `open`, `grep`, `glob`, `mktemp`, and
`mkdtemp`.

`mktemp(prefix?)` returns a unique file path without creating it.
`mkdtemp(prefix?)` creates a unique directory and returns its path. Use the one
that matches what you want; a `mktemp` path is not an existing directory.

`fs.open(path, flags?, mode?)` returns a low-level file handle
`{ fd, read, write, stat, close }` that works the same in eval, panels,
workers, and Durable Objects. `read(buffer, offset, length, position)` resolves
to `{ bytesRead, buffer }`; `write(data, offset?, length?, position?)` resolves
to `{ bytesWritten, buffer }`. Always close the handle in `finally`:

```ts
const path = await fs.mktemp("handle");
await fs.writeFile(path, "hello");
const handle = await fs.open(path, "r+");
try {
  const buffer = new Uint8Array(5);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  await handle.write(new TextEncoder().encode("H"), 0, 1, 0);
  console.log({ bytesRead, text: new TextDecoder().decode(buffer) });
} finally {
  await handle.close();
  await fs.rm(path, { force: true });
}
```

`fs.stat()` and `fs.lstat()` return Node-style metadata: `mtime` and `ctime`
are `Date` objects (with numeric `mtimeMs`/`ctimeMs`), alongside `size`,
`mode`, and the `isFile()`/`isDirectory()`/`isSymbolicLink()` methods.

Imports of `node:fs`/`node:fs/promises`, and the bare aliases `fs`/
`fs/promises`, use this same context-scoped filesystem, never the host
filesystem. The other supported Node modules also accept both spellings:
`node:path`/`path`, `node:os`/`os`, `node:util`/`util`, and
`node:crypto`/`crypto`. Eval is asynchronous, so prefer promises. With a
default or namespace import of `node:fs`, common synchronous calls at the top
level, such as `readFileSync()`, `writeFileSync()`, and `unlinkSync()`, are
automatically turned into awaited async calls. Inside a nested synchronous
callback, call the async methods yourself.

- `node:path` is available for path manipulation.
- `node:os` is a neutral stand-in for portable code: `tmpdir()` returns the
  context-local `/.tmp` directory rather than a host path, and machine
  identity, network, CPU, and memory methods return fixed values that reveal
  nothing about the host.
- `node:util` provides the pure helpers, including `TextEncoder`,
  `TextDecoder`, `inspect`, and `promisify`.
- `node:crypto` provides pure hashing, randomness, and Web Crypto
  compatibility.

For throwaway files, let `mktemp` choose an untracked path. This is the
standard write, rename, and content check:

```ts
const source = await fs.mktemp("copy-rename");
const renamed = `${source}.renamed`;
const expected = "sandbox rename check\n";

try {
  await fs.writeFile(source, expected);
  await fs.rename(source, renamed);
  const actual = await fs.readFile(renamed, "utf-8");
  if (actual !== expected) throw new Error("content mismatch after rename");
} finally {
  await fs.rm(source, { force: true });
  await fs.rm(renamed, { force: true });
}
```

Use `fs.copyFile(source, destination)` instead when both files should remain.
Paths inside a managed workspace repository (`packages/<name>/…`,
`panels/<name>/…`, etc.) go through the semantic filesystem adapter, whose move
and copy operations preserve file identity and record copy ancestry. Paths that
the platform ignores, and paths outside workspace source, are plain
context-local scratch files. Use `mktemp` for scratch.

## Calling Services

`services.<svc>.<method>(...)` calls the raw server service method; it is
shorthand for `rpc.call("main", "<svc>.<method>", [...])`. It is always the raw
service, even when a runtime binding shares the name: `services.workers` is the
`workers` service catalog, while the `workers` runtime binding is the typed
client with `create`/`list`/`destroy` and `listSources()`.

```
eval({ code: `
  const tree = await rpc.call("main", "workspace.sourceTree", []);
  console.log("Workspace tree:", tree);
  // Use the ergonomic runtime binding when available:
  const tree2 = await workspace.sourceTree();
` })
```

Use `await help()` for live discovery, and `await help("vcs")` or
`await help("workers")` for a compact method index of one runtime binding.
Then ask for the method you need, such as `await help("vcs.edit")`, to get its
exact arguments, return schema, and typed errors. Pass the name as a string;
`help(workers)` does not work.

`help()` covers injected runtime bindings and receiver services, not arbitrary
package exports. For workspace skill or package functions, read that package's
skill or API reference and its exported types, then import the documented API.
If `help` does not know a name, that does not mean a documented package is
unavailable.

## Worker Management

Durable Object schema failures are platform compatibility refusals, not errors
in your JavaScript. Eval keeps their stable code and structured data:

- `DO_SCHEMA_INCOMPATIBLE`: read `errorData.reason`, `persistedVersion`,
  `targetVersion`, `source`, `className`, `objectKey`, and `safeActions`. This
  pre-release system accepts only the current schema. Do not add a migration
  callback, compatibility reader, or hidden version field. Recreate disposable
  state, or export valuable data and import it through the current interface
  as part of a coordinated cutover.
- `DO_MAINTENANCE_IN_PROGRESS`: a reset, restore, or snapshot is currently
  blocking calls to this object. Wait for it to finish; do not resolve another
  handle to get around it.

For disposable state only, resolve the exact target and call
`workers.resetStorage(target, intent)`. The returned operation id identifies
the verified backup taken automatically. To recover, use
`workers.listStorageBackups(target)` and
`workers.restoreStorageBackup(target, operationId, intent)`.

Start, list, and stop regular workers with `workers.create`, `workers.list`,
and `workers.destroy`. They wrap the runtime entity lifecycle, whose raw
methods remain available for advanced use and non-worker entities. List
launchable sources with `workers.listSources()`. Each row has `source`, the
manifest's real `entry` (do not guess `index.ts`), and `classes` (empty for
regular workers).

```
eval({ code: `
  // Launchable worker sources (the workers/* repos that can be started)
  const sources = await workers.listSources();
  console.log("Available worker sources:", sources);

  // Currently-running worker instances
  const instances = await workers.list();
  console.log("Running instances:", instances.map((w) => w.id));
` })
```

```
eval({ code: `
  const key = \`worker-probe-${crypto.randomUUID()}\`;
  let handle;
  try {
    // \`key\` names the instance. An omitted \`ref\` builds this eval
    // caller's context; the explicit ref below makes that visible.
    handle = await workers.create("workers/my-worker", {
      key,
      contextId: ctx.contextId,
      ref: \`ctx:${ctx.contextId}\`,
      env: { NON_SECRET_PROBE: "configured" },
    });
    const during = await workers.list();
    if (!during.some((entity) => entity.id === handle.id)) throw new Error("Worker was not listed");
  } finally {
    if (handle) await workers.destroy(handle);
  }
  const after = await workers.list();
  if (handle && after.some((entity) => entity.id === handle.id)) {
    throw new Error("Worker remained active after retireEntity");
  }
` })
```

`env` adds string bindings that arrive in the worker's `env` parameter
(`WorkerEnv`), not in Node's `process.env`. A successful
`runtime.createEntity` shows that the host accepted the configuration and
started the worker; it does **not** show that the worker code read a given
value. To confirm that, call a worker HTTP endpoint or RPC method built to
return one named, non-secret probe value, through the returned `targetId` of
the worker you are testing. Never add generic introspection that returns the
whole env object or arbitrary secret keys, and do not test a permanently
shipped sample worker in place of the real one. See
[workspace-dev/WORKERS.md](../workspace-dev/WORKERS.md#worker-lifecycle-and-environment-bindings)
for the worker-side probe pattern.

## Workspace VCS

The runtime `vcs` namespace and the server `vcs.*` service are generated from
the same method registry. Use `await help("vcs")` for the method index and
`await help("vcs.edit")` for a method's exact schema, and read
[vibestudio-vcs](../vibestudio-vcs/SKILL.md) for the protocol.

From eval:

- take the context from ambient `ctx.contextId` or the imported `contextId`;
  never invent a default context or repository path;
- call `vcs.status({ contextId })` and use `status.workingHead` as the basis
  for reads and mutations;
- find managed files with `vcs.listFiles`, then read them by stable file ID
  with `vcs.readFile`;
- send `vcs.edit` requests with `expectedWorkingHead`;
- use `vcs.move` and `vcs.copy` for renames and copies of managed files;
- compare one exact target state with one source event, merge in bounded pages
  of stable coordinates, and review the intent and composed projections;
- commit or discard the whole local application chain;
- before protected publication, run typecheck, test, and build yourself for
  confidence; `vcs.push` neither runs nor certifies them;
- bring in a trusted external tree with `vcs.importSnapshot` instead of
  disguising it as local edits, and keep the
  event/application/work unit/repository/snapshot acknowledgement it returns.

Branch on the typed result and error discriminants of every mutation. When the
outcome is uncertain, retry with the same command ID and identical payload; if
you change the request after a freshness failure, use a new command ID. A
content-only build selector says nothing about semantic ancestry, decisions,
or integration.

The generated
[VCS authoring examples](../vibestudio-vcs/references/authoring-basics.md)
show the release-tested `status` → repository discovery → `readFile` →
`readFile` → `edit` sequence and the full `RevisionChanged` recovery rule.

## Large Results And Diagnostics

Do not return whole hydrated channel histories, full `scope` dumps, large DOM
dumps, or full GAD payloads from `eval`. Large values are stored as blob refs
in trajectory/channel storage on purpose; broad hydrated reads pull them back
into the transcript and bury the useful part of the report.

As a safety net, eval windows large console, error, and return data before it
is stored or delivered. The tool result then points to
`scope.$lastLargeConsole`, `scope.$lastLargeError`, or `scope.$lastLargeReturn`
when a bounded copy was saved. These slots are not overwritten by small
follow-up results, so you can read them over several calls. Keep each page you
return small, because it goes through the same bounded eval result:

```ts
return {
  length: scope.$lastLargeReturn.length,
  sample: scope.$lastLargeReturn.slice(0, 1_500),
};
// For a JSON-serializable original value:
const recovered = JSON.parse(scope.$lastLargeReturn);
return { keys: Object.keys(recovered), firstEntry: recovered.entries?.[0] };
// or
return /needle/.test(scope.$lastLargeConsole);
```

These slots are for recovery. Return compact summaries in the first place,
using the compact inspectors:

```ts
return await rpc.call("main", "gad.inspectChannelEnvelopes", [
  { channelId, limit: 50 },
]);
return await rpc.call("main", "gad.inspectTurnState", [{ branchId }]);
return await rpc.call("main", "gad.inspectInvocationState", [
  { transportCallId },
]);
return await rpc.call("main", "gad.inspectPublicationIntegrity", [
  { channelId },
]);
return await services.serverLog.query({
  level: "warn",
  contains: "BuildV2",
  limit: 100,
});
```

If you need a large artifact, store the full bytes or text in the
**blobstore** and return its digest, byte count, and a short sample. Keep full
objects in `scope` only for short-lived interactive follow-up.

The blobstore is a runtime binding: use the injected `blobstore` (also
`import { blobstore } from "@workspace/runtime"`), or the raw service through
`services.blobstore` or `rpc.call("main", "blobstore.<method>", [...])`. Read and write methods
(`putText`/`putBase64`/`getText`/`readText`/`getRange`/`grep`/…) work from
agent eval; the admin methods (`delete`/`list`) are server-only. Binary data
such as a `Uint8Array` screenshot can be stored directly.

For panel captures, return `await handle.cdp.screenshot()`, on its own or
inside an object or array with other results. The image is attached to the
result automatically; the returned structure holds compact image receipts, not
base64 data, and no temporary file is needed. If an image artifact is missing,
delivery fails with an explicit error. For other binary artifacts:

```ts
const png = await page.screenshot();
const { digest, size } = await blobstore.putBytes(png);
return { digest, size, mimeType: "image/png" };
```

The raw service takes exactly one base64 string:

```ts
const { digest, size } = await services.blobstore.putBase64(pngBase64);
return { digest, size, mimeType: "image/png" };
```

The content-addressed store records only bytes. Keep the MIME type, filename,
and other metadata next to the returned digest; do not pass them as extra
`putBase64` arguments.

Recommended return shape for large artifacts:

```ts
const text = JSON.stringify(largeValue);
const stored = await blobstore.putText(text);
return {
  omitted: true,
  reason: "large diagnostic value stored in blobstore",
  digest: stored.digest,
  bytes: new TextEncoder().encode(text).byteLength,
  type: Array.isArray(largeValue) ? "array" : typeof largeValue,
  keys:
    largeValue && typeof largeValue === "object"
      ? Object.keys(largeValue).slice(0, 20)
      : [],
  preview: text.slice(0, 1000),
};
```

`readText(digest)` is an alias of `getText(digest)`; both return
`string | null` directly, not an object with a `text` property.

The method transport also caps oversized stored results and records a blob
digest when storage is available. Still return bounded summaries: they are
easier to inspect and less likely to hide the important error message. Read
stored text with `blobstore.getRange(digest, offset, length)` or search it on
the server with `blobstore.grep(digest, pattern)`.

## Build System

```
eval({ code: `
  // Build services default to protected main when no ref is given
  const build = await rpc.call("main", "build.getBuild", ["panels/my-app"]);
  console.log("Build artifacts:", Object.keys(build));

  // Pass a ctx: ref to build the working state of a context instead.
  const branchBuild = await rpc.call("main", "build.getBuild", ["panels/my-app", \`ctx:\${ctx.contextId}\`]);
  console.log("Context branch build:", branchBuild.sourceStateHash);

  // VCS reports the exact semantic state; ordinary build services validate it.
  const status = await vcs.status({ contextId: ctx.contextId });
  console.log("Building working state:", status.workingHead);

  // Direct runtime launches build the initiating caller's context unless
  // \`ref\` is explicit (main when the caller has none). This creates a worker
  // that reads/writes ctx-1 but runs this eval caller's code:
  await rpc.call("main", "runtime.createEntity", [{
    kind: "worker",
    source: "workers/agent-worker",
    key: "agent-main-code",
    contextId: "ctx-1"
  }]);

  // Targeted branch launch for testing code edited in ctx-1:
  await rpc.call("main", "runtime.createEntity", [{
    kind: "worker",
    source: "workers/agent-worker",
    key: "agent-ctx-code",
    contextId: "ctx-1",
    ref: "ctx:ctx-1"
  }]);

  // Check effective version
  const ev = await rpc.call("main", "build.getEffectiveVersion", ["panels/my-app"]);
  console.log("Effective version:", ev);
`
})
```

## Return Values

The last expression or `return` value is serialized and sent back to the agent:

```
eval({ code: `
  const files = await fs.readdir("src");
  return files;
` })
// Agent receives a result whose returnValue is ["index.ts", "utils.ts", ...]
```

## Timeouts

Eval runs have no default wall-clock deadline. Pass a positive integer
`timeoutMs` when a call must finish within a known time, for example a probe
that may stall. When the deadline passes, async work is cancelled normally, and
synchronous loops and functions are stopped at cooperative checkpoints and
reported as an eval error instead of hanging the agent runtime. You can split
long work into shorter runs and keep state in `scope` or `db`; both persist in
the EvalDO between runs, across turns, and across panel disconnects.

Use the failure that fits the task. To test error handling and recovery, throw
the error in one eval and follow it with a successful eval. Use `timeoutMs`
only when the task calls for a deadline or the work may never settle; a timeout
is not a stand-in for a thrown error.

To test timeout recovery, give async work that never settles a short deadline,
check that the tool result reports the failure, then make a normal eval call.
The successful follow-up shows that the timed-out run finished and the sandbox
is still usable:

```ts
eval({
  timeoutMs: 250,
  code: `await new Promise(() => {});`,
});
// Expected tool error: eval timed out after 250ms

eval({ code: `return "recovered";` });
```

Use a pending async operation for this test, not an infinite synchronous loop:
the async version exercises normal cancellation without starving the sandbox
process.

With a deadline set, eval inserts cooperative checks into the loops and
function entries it compiles for that call, so ordinary synchronous loops and
recursion stop inside their own sandbox. Functions kept from an earlier eval
without a deadline, and native or built-in calls, cannot be instrumented after
the fact; for those, the host process watchdog is the last line of defense.

Host-side code that calls the lower-level `eval.cancel` service must check its
`forcedReset` result:

- `false`: only the requested run was cancelled, and the persisted scope and
  user `db` were kept.
- `true`: the run or its registered cleanup did not finish within the
  cancellation grace period, so the EvalDO cancelled every unfinished run and
  reset its shared scope and user `db` to recover. Do not try to read cleanup
  records from the reset scope; report the forced recovery and start fresh.

Cancellation goes through a persisted `cancelling` phase, which is not final.
During it, the run and every child run it started keep their permissions while
registered cleanup stops child work, writes final records, and releases owned
resources. Callers that poll must wait past `cancelling`; only `cancelled`
means teardown is complete. A cleanup failure is still returned to the caller
of cancel and recorded, but the run is marked finished so it cannot hold its
admission forever.
