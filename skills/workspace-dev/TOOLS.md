# Agent Tools Reference

Your working directory is the **context folder**, an isolated copy of the
workspace.

**CRITICAL RULES:**

- All file paths are **relative to your working directory** (e.g., `panels/my-app/index.tsx`).
- **NEVER** use host absolute paths (e.g., `/home/.../workspace/panels/...`). Runtime `fs.*` also accepts context-root absolute paths like `/panels/my-app/index.tsx`, but prefer `panels/my-app/index.tsx` in examples and source edits.
- **NEVER** use `Bash` for git operations, file listing, or file creation. Use the structured tools.
- In eval, `rpc`, `services`, `fs`, `ctx`, `scope`, `scopes`, `db`, `help` (and, in agent eval, `chat`) are **injected free variables**; do **not** import them. Prefer the typed `services.<svc>.<method>(...)` clients. A direct public `rpc.call` requires a receiver-owned descriptor; for host methods, import `mainRpcMethods` from `@vibestudio/service-schemas/mainRpc`. `services.<svc>` is the service client, even when a runtime binding shares the name. Import workspace/npm **packages** in each invocation that uses them (`import { prepareProjects } from "@workspace-skills/workspace-dev"`). Static imports and literal dynamic imports use the same per-owner loader; see the [import contract](../sandbox/EVAL.md#imports).

---

## Filesystem Tools (Native SDK)

### Read

Read file contents.

```
Read({ file_path: "panels/my-app/index.tsx" })
```

### Write

Create or overwrite a file.

```
Write({ file_path: "panels/my-app/index.tsx", content: "..." })
```

### Edit

Edit a file using string replacement.

```
Edit({
  file_path: "panels/my-app/index.tsx",
  old_string: "const [value, setValue] = useState('')",
  new_string: "const [value, setValue] = useState('initial')"
})
```

### Glob

Find files by glob pattern.

```
Glob({ pattern: "**/*.tsx" })
Glob({ pattern: "panels/*/package.json" })
```

### Grep

Search file contents. Grep matches literally by default, which suits code
snippets, identifiers, function calls, paths, and punctuation. Set
`literal: false` only when the pattern is a deliberate regex.

```
Grep({ pattern: "useState", path: "panels/my-app" })
Grep({ pattern: "openPanel(", path: "workspace/packages/runtime" })
Grep({ pattern: "import.*runtime", path: "panels/my-app", literal: false })
```

`Read`, `Glob`/`find`, and `Grep` may use the optional native
`@workspace-extensions/file-tools` accelerator. The tools never depend on it:
each accelerator call has a 15-second deadline, inherits tool cancellation, and
falls back to the context filesystem (or the host filesystem service for grep).
A fallback is shown as tool progress and recorded in
`details.extensionFallback` with the operation and reason, for example
`file-tools find timed out after 15000ms`. Do not wait on or retry a stalled
helper; continue with the fallback result. An abort stays an abort and never
becomes a fallback. The 15-second limit bounds only that replaceable
optimization, not the RPC operation: the logical filesystem operation, eval run,
or system-test run stays alive until its caller cancels.

The context filesystem transport has no per-operation deadline. Its RPC
belongs to the enclosing tool or run and ends only when that caller cancels, so
a slow but valid filesystem operation is never reported as an infrastructure
failure. A missing path is a normal discovery result, distinct from
cancellation. Likewise, in-process agent tools have no implicit wall-clock
deadline and are cancelled only when the agent turn is explicitly cancelled. A
tool may define its own deadline as part of its semantics; for example, `eval`
accepts an opt-in `timeoutMs` and delivers long-running results asynchronously.

Channel trajectory terminals and other structured envelopes are delivered from a
durable outbox with a 15-second deadline per transport attempt. If a
participant is unavailable or stuck, the channel alarm is released, the failure
is recorded, and the outbox retries, so the caller's terminal tool result and
other channel work are not blocked. Like the accelerator limit above, this
bounds one attempt; the delivery itself stays alive in durable state.

Protected publication updates the package graph and effective-version index
before warming caches speculatively. Resolving or opening a newly published
unit therefore waits only for its graph identity and its own on-demand build. A
slow, unrelated background build cannot hide the new unit or stall filesystem
and VCS requests.

---

## Creating Projects

Creating a project is stage one: a preparation edit in the current context. It
does not commit, push, start a runtime, or grant authority. Stage two is review,
verification in this context, and a normal VCS commit and push. Read
[PROJECTS.md](PROJECTS.md) for the full policy example and receipt contract.

### Icon authoring

Import these from `@workspace-skills/workspace-dev`:

- `searchProjectCatalog({ resource: "icon", query?, families?, limit? })`
  finds catalog IDs. `listProjectIcons()` lists all installed IDs.
- `prepareUnitIcon(icon)` returns `{ icon, files }` without changing anything.
  It turns a catalog ID into local SVG artwork and a `./` path for the
  manifest. Use it when writing complete app/extension files yourself.
- `setUnitIcon({ repoPath, icon })` updates an existing executable unit's
  manifest and artwork in one semantic VCS edit, checked against the working
  head. It supports `about/`, `panels/`, `workers/`, `apps/`, and
  `extensions/`. Keep its receipt in `scope`; review, verify, commit, and
  publish separately.

`prepareProjects` and `prepareApplication` use the same icon resolver. Stored
manifests accept one emoji or a safe unit-relative image path, never a catalog
ID, label, URL, or data URL. See [icon authoring](references/icons.md).

### Preparation API

- `prepareApplication({ name, title?, icon?, authority })` prepares a React
  panel, SQLite DO store, protocol, singleton, and config in one edit. The
  generated two-method record store is starting code, not a fixed application
  API. Extend its data, methods, reviewed policies, and UI to deliver the
  requested features before final verification and publication. `authority` is
  the required `ApplicationAuthorityPolicy`: rationale, complete panel and worker
  manifests, service principals/binding/notability, and complete literal
  contracts for both record methods. Nothing in the request or policy is
  inferred.
- `prepareProjects(projects)` prepares independent repositories in one edit
  and returns an array. Each input has `projectType`, `name`, and optional
  `title`, `icon`, `template`, and portable panel `website` entry options.
  Executable inputs require `authority` and `authorityReason`; the
  `durable-service` template also requires `methods`.
- `forkProject({ from, to, authority?, authorityReason?, dryRun?, rewrite?, classMap? })`
  prepares copied source. `forkPanel` and `forkWorker` take `from`, `name`,
  required `authority` and `authorityReason`, and optional `title`, `dryRun`,
  and (worker only) `classMap`. Executable forks replace the copied authority
  ceiling with the policy you pass; they never inherit authority silently. Dry
  runs run preflight without changing anything.

Supported repository kinds are `panel`, `worker`, `package`, `skill`, and
`project`. A repository's kind is determined by its location; `projectType`
cannot change an existing repository's kind. Put guidance for a repository in
its own `SKILL.md` rather than creating a new skill repository. Use plain
writes under `projects/` for private scratch content.

Import the preparation functions in each eval invocation. Write the policy for
the actual task before calling them; do not paste an example policy to make an
authority diagnostic go away.

### Receipts and review

A prepared unit returns `{ created, files, preflight, preparation, authorityReview }`.
A connected app returns `{ panel, worker, service, preparation, authorityReview }`,
not an array. Keep the result in `scope.prepared`. The panel path is
`scope.prepared.panel.created` for an application and
`scope.prepared[0].created` for the first independent unit. The preparation
receipt identifies the context's working head and reports
`publication: "unchanged"` and `liveRuntime: "unchanged"`.

The authority review packet shows the requested manifest and rationale; for an
application it also shows the service and receiver choices. `AUTHORITY.md`
records the rationale you supplied. These are for review; they grant nothing.
After later edits, verify the current source.

Preflight checks manifests, source, and dependencies without changing anything.
It does not build or authorize publication; build verification and the
protected push complete that check. On `ProjectPreflightError.errorData`, each
dependency issue lists the file, line, import syntax, coordinate, required
manifest field, and accepted package coordinates. Production imports belong in
dependencies/peerDependencies; test-only and type-only imports may use
devDependencies. Fix the named source or manifest; do not probe unrelated fork
sources.

Fork rewriting updates the package name, entry, title, and class metadata
structurally. It does not apply worker source-string replacements to the
already-rewritten manifest. Check dry-run rewrites and warnings, and pass an
explicit class map when several classes need renaming.

### Verify and publish separately

Review the complete requested authority against what the application does: its
effects, resources, callers, website access, and data sensitivity. Empty
requests are intentional; scaffolding never adds blanket context-boundary or
clone requests. Run `verify` on the specific targets, compare with main, commit
the reviewed chain, and push that event through VCS. See
[WORKFLOW.md](WORKFLOW.md#development-loop). Publication goes through the
existing protected gate and user decision; preparation adds no separate
approval.

Preparation, publication, and activation are separate phases, and a later
failure does not undo an earlier edit. Never call a preparation API again to
recover an existing candidate. If an edit response was lost, check current VCS
status and destinations. For publication failures, use the typed VCS retry
policy and receipts. There is no scaffold-specific publication recovery API.

---

## eval

Runs TypeScript/JavaScript server-side in your own notebook sandbox (a
per-agent EvalDO), even when no panel is open. The live heap persists while
execution or cancellation is in progress and for 30 minutes of inactivity
afterwards; every cell renews this idle lease. After an unavoidable restart,
`[kernel] Restarted` lists which scope keys were restored and which were lost.
In eval, `rpc`, `services`, `fs`, `ctx`, `scope`, `scopes`, `db`, `help` (and,
in agent eval, `chat`) are injected free variables. Public `rpc.call` requires
the receiver-owned method descriptor and argument tuple. For host methods,
import `mainRpcMethods` from `@vibestudio/service-schemas/mainRpc`; use the
validating `mainRpcMethod(name)` lookup for a dynamically selected host method,
which returns `unknown`. Prefer the rich runtime bindings (`workers`, `vcs`,
`fs`, etc.) for workspace operations. `services.<svc>.<method>(...)` is the
typed service-client form. Do **not** import the injected names from
`@workspace/runtime`.

**IMPORTANT:**

- Static imports and literal dynamic imports load workspace/npm packages through the same per-owner loader. Import the functions in every invocation that uses them, and keep values and handles explicitly in `scope`. See the [import contract](../sandbox/EVAL.md#imports).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | string | Yes | Code to execute |
| `syntax` | `"javascript"` \| `"typescript"` \| `"tsx"` \| `"jsx"` | No | Syntax mode (default: `"tsx"`) |
| `imports` | `Record<string, string>` | No | Packages to build on-demand. Workspace packages: `"latest"` or a git ref. npm packages: `"npm:<version>"` (e.g. `"npm:^4.17.21"`, `"npm:latest"`) |
| `timeoutMs` | positive integer | No | Optional wall-clock deadline in milliseconds; omitted means no deadline |

For inline code with relative imports, `sourcePath` (or the inline `path` hint)
is the virtual location of the eval module itself, not the module being
imported. To import `./index.ts`, use its directory or a different filename
such as `src/eval-check.ts`; `src/index.ts` would import itself.

### Panel APIs

`createPanelSlot`/`openPanel`/`getPanelHandle`/`panelTree` are part of the **portable runtime surface**: importable from `@workspace/runtime` (and injected) in panels, workers, **and server-side eval**. They run over RPC through the host, so eval creates and inspects panels via the server. To change a panel's state from eval, use the returned `PanelHandle.stateArgs.patch/get`; do not resolve the internal `workspace.state` service yourself. Some panel-only APIs (`panel.focusPanel`, `buildPanelLink`, `panel.reopen`, `panel.stateArgs`, `adblock`, `journal.Journal`, `agentApi`) are NOT available in eval and need a real panel host:

| API                              | Description                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createPanelSlot(source, opts?)` | Commit an unloaded panel and return its handle, without allocating a presentation lease or waiting for application readiness                     |
| `openPanel(source, opts?)`       | Open any panel (URLs become browser panels, source paths open workspace panels; works in eval); waits until ready, failed, stopped, or cancelled |
| `buildPanelLink(source, opts)`   | Build a URL for panel navigation (panel/component code only, not eval)                                                                           |
| `panel.focusPanel(panelId)`      | Focus an existing panel by ID (panel/component code only, not eval)                                                                              |
| `panel.switchContext(id, opts?)` | Move this panel to an existing workspace branch; state args cannot select a context                                                              |

`await openPanel(...)` returns only once that runtime attempt is application
boot-ready. Resolve, build, host, and boot failures reject with
`PanelOperationError` and structured provenance. The tree slot is committed
immediately and its build/host/boot lifecycle continues asynchronously, so a
broken panel cannot block owner seeding or other tree operations; the returned
promise only observes that lifecycle and never fails on elapsed time. Pass an
`AbortSignal` when the caller owns cancellation. Use `createPanelSlot(...)` when
the committed navigation receipt is the result you need, and observe the
returned handle separately if readiness matters.

Pass a stable `operationId` whenever the surrounding workflow may retry, so
creation resolves to the same slot. The retry identity also includes `source`,
`contextId`, `parentId`, and `ref`: an identical retry resumes the existing
slot, while a different open gets a different identity. Do not combine
`operationId` with `slug`. Every readiness-bearing handle method accepts
cancellation: pass `{ signal }` to `snapshot`, `reload`, and `rebuild`, or add
`signal` to the options of `navigate` and `focus`.

A panel's code builds from its own context unless `ref` names other code.
`openPanel(source, { contextId: ctx.contextId })` shares the current context
and runs its working code, including later edits on `rebuild()`. Without
`contextId`, the panel gets a new context forked from the caller's current
working state: it runs the caller's code as of the fork, and later edits in the
caller's context do not reach it. Pass `ref: "main"` to run protected main
deliberately.

In **eval**, `rpc` has the same typed shape as in panels and workers:
`rpc.call(target, methodDescriptor, args)`. Host methods use the target `"main"`
and the canonical descriptors from `@vibestudio/service-schemas/mainRpc`, for
example `rpc.call("main", mainRpcMethods["build.getBuild"], ["panels/my-app"])` or
`chat.rpc.call("main", mainRpcMethods["build.recompute"], [])`.

`await workspace.projects()` lists the `projects/*` repository roots, and
`await workspace.projectForPath(path)` returns the project containing a path, or
`null`. Both are methods on `workspace`, not a nested namespace.

### Using extensions

Extensions are **declared** in `meta/vibestudio.yml` under `extensions:`, and
editing that list is the only way to add or remove one. Saving the change is a
gated meta write that raises one combined approval for all newly declared
extensions. Once declared and approved, call it; an `onInvoke` extension starts
on demand.

- **Anywhere** (eval, panels, components, workers), import `extensions` from
  `@workspace/runtime` and call `extensions.use(name).method(...)`, a typed
  client over the extensions RPC. The untyped primitive is
  `extensions.invoke(name, "method", [args])`, the same signature as the raw
  `services.extensions.invoke(...)` service method.
- List declared extensions with `services.build.listUnits()` filtered to
  `kind === "extension"`.

Individual extension methods can still request their own approvals when an
operation needs one, such as running tests.

`build.listUnits()` rows expose `name` (the scoped package name), `source` (for
example `extensions/test-runner`), `displayName`, and build/approval readiness.
Invocation accepts the package name, source path, or the source path's final
segment; prefer the package name in persistent code and docs. Display titles
and guessed abbreviations are not identifiers.

`extensions.use(name)` is synchronous and returns a method proxy: do not
`await` it or call `.catch(...)` on it. Catch the method call instead:
`await extensions.use(name).method(...).catch(...)`.
`extensions.invoke(name, "method", [args])` returns the result promise
directly, so `.catch(...)` it as usual. Both fail with `ENOEXT` if the extension
is not declared and `ENOTREADY` if it is still starting. To use an extension
that is not declared yet, edit `meta/vibestudio.yml`.

Extension methods normally use unary RPC and must return JSON-serializable
values. A method that returns a `Response` or `ReadableStream` uses streaming
RPC end to end. Streaming needs `extensions.use`, not `extensions.invoke`; the
client reads the streaming methods from the extension's manifest, and
`streamingMethods` overrides that list:

```tsx
import { extensions } from "@workspace/runtime";

type ShellApi = {
  attach(sessionId: string): Promise<Response>;
  write(sessionId: string, data: string): Promise<void>;
};

const shell = extensions.use<ShellApi>("@workspace-extensions/shell", {
  streamingMethods: ["attach"],
});
```

To find extension identities from eval, read the unit inventory:

```ts
eval({
  code: `
  return (await services.build.listUnits())
    .filter((unit) => unit.kind === "extension")
    .map(({ name, source, displayName, status }) => ({ name, source, displayName, status }));
`,
});
```

This shows build/approval readiness, not running processes. A cold `onInvoke`
extension does not need a running process: invoking it checks the approved
source, builds, activates, and awaits the result.

If the user denies the approval for a newly declared extension, stop and report
that the requested operation needs it.

#### Shell command execution

Use the shell extension's `exec` method for a finite command whose full
stdout/stderr fits in one structured result. Prefer argv mode (`shell: false`)
so `/bin/sh` does not reinterpret the arguments:

```ts
const result = await services.extensions.invoke(
  "@workspace-extensions/shell",
  "exec",
  [
    {
      command: "/usr/bin/printf",
      args: ["hello from argv mode"],
      shell: false,
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
    },
  ],
);
return result;
```

The request fields are `command`, `args`, `cwd`, `env`, `shell`, `timeoutMs`,
`stdin`, `maxOutputBytes`, and optionally `contextId` plus a freshly issued
`contextAttachToken`. `timeout`, `cancelled`, and a single shell command string
are not accepted as aliases. The result is `{ exitCode, stdout, stderr,
durationMs, timedOut?, truncated? }`.

`exec` requires the `native.shell.execute` capability declared in the shell
extension's manifest. The calling panel, worker, DO, or agent eval is the
principal that needs the authority, even though the native extension spawns the
process. If the call cannot acquire authority, attribution or propagation is
broken; do not work around it with a temporary panel or another process path.

**Pre-injected** (use directly, do NOT import):

| Variable    | Description                                    |
| ----------- | ---------------------------------------------- |
| `contextId` | Current agent context ID for scoped operations |

### RPC Services

From eval, prefer the runtime clients (`workers`, `vcs`, `fs`, etc.) for
workspace operations. Use the typed `services.<svc>.<method>(...)` client when
following a `docs_open` service catalog entry. For direct public `rpc.call`, use
the receiver's descriptor table. `services.workers` is the host service client,
not the `workers` runtime client.

#### Worker lifecycle (portable typed client)

Launch, list, and retire regular workers with the typed `workers` client. It is
available in panels, workers, DOs, and eval, and delegates to the runtime entity
API. Raw `runtime.*` calls remain available for advanced and non-worker entity
operations.

```
// Launch a worker — `key` names the instance
eval({ code: `
  const handle = await workers.create("workers/my-worker", {
    key: "my-worker",
    contextId: ctx.contextId,
  });
  scope.workerId = handle.id; // e.g. "worker:workers/my-worker:my-worker"
  console.log("Worker started:", handle.id, "→ target", handle.targetId);
`
})

// List running workers
eval({ code: `
  const list = await workers.list();
  console.log(list.map(w => w.id + " (" + w.source + ")"));
`
})

// Retire (stop) a worker — pass the id from the launch handle (or listEntities)
eval({ code: `
  await workers.destroy(scope.workerId);
`
})
```

`contextId` selects the runtime state partition. On direct creation, an omitted
`ref` selects the verified initiating caller's semantic workspace, regardless of
that partition. Pass `ref: "ctx:<contextId>"` to build from another context, or
`ref: "main"` to use protected main deliberately. Clones build from their cloned
semantic frontier; reserved activation defaults to its retained context.

Lifecycle methods:

- `workers.create(source, { key, contextId, env, stateArgs, ref? })` creates an
  owned regular worker.
- `workers.createDurableObject(source, className, { key, contextId, stateArgs, ref? })`
  creates an owned disposable Durable Object.
- Both return `{ id, targetId, … }` handles accepted by
  `workers.destroy(handleOrId)`.
- `workers.resolveService(...)` and `workers.resolveDurableObject(...)` address
  existing targets but never transfer lifecycle ownership.
- `workers.list()` lists live regular worker **instances**.
  `build.listUnits()` lists declared sources and their build readiness, and
  `runtime.supervision.list()` returns the identities of live drivers.
- `workers.listSources()` lists launchable sources; use each row's `entry`
  rather than guessing `index.ts`.
- The raw `runtime.createEntity/listEntities/retireEntity` methods are the
  lower-level entity lifecycle API.
- To duplicate or tear down a whole context's durable state, use
  `runtime.cloneContext(...)` and `runtime.destroyContext(...)`; the low-level
  cloneDO/destroyDO primitives are server-internal.

See [WORKERS.md](WORKERS.md) for details.

For app data, prefer a Durable Object service over eval `db` or ad hoc files.
The DO keeps its data in SQLite through `this.sql`, the live service
declaration sets `authority.principals`, and each method declares its `@rpc`
receiver policy. Callers use `workers.resolveService(protocol, objectKey?)` plus
`rpc.call(targetId, methodDescriptor, args)`, using a descriptor exported by the receiver's contract. See
[WORKERS.md](WORKERS.md#durable-object-backed-app-databases).

#### Semantic workspace version control

Workspace VCS is a single semantic graph. A state is either a committed event
or a local work application; repositories, paths, and file listings are views of
that state. Commands, work units, changes, applications, decisions, events,
files, and content mappings can all be traversed directly.

Read the [Vibestudio VCS skill](../vibestudio-vcs/SKILL.md) before using this
API. Its references cover state nodes, merge decisions, whole-chain
commit/discard, file identity, counteractions, provenance reads, and typed
recovery.

Core routing:

| Intent                       | Runtime surface                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orient in a context          | `vcs.status()` uses the runtime's bound semantic context and returns committed event, working head, main relation, and local counts                                            |
| Compare committed work       | `vcs.compare` from a target state to one source event                                                                                                                          |
| Account for incoming changes | `vcs.merge` over stable coordinates; review intents/composed results and resolve conflicts with `theirs`, `ours`, or `current`                                                 |
| Commit context work          | `vcs.commit` consumes the complete local application chain                                                                                                                     |
| Publish committed work       | `vcs.push` gates the affected build/typecheck closure, then advances protected main to one committed event                                                                     |
| Read or list managed files   | `vcs.readFile` and `vcs.listFiles` at an event/application state                                                                                                               |
| Move managed identities      | `vcs.move` preserves file or repository identity                                                                                                                               |
| Copy managed content         | `vcs.copy` mints file identity and records immediate copy provenance                                                                                                           |
| Import external content      | `vcs.importSnapshot` records one complete snapshot and atomically returns its event/application/work-unit/repository/snapshot evidence; it does not import per-path authorship |
| Undo named changes           | `vcs.revert` authors explicit counteractions                                                                                                                                   |
| Explain history or content   | `vcs.inspect`, `vcs.neighbors`, `vcs.history`, and `vcs.blame`                                                                                                                 |
| Validate a working build     | use the typecheck, test, and build services for the context                                                                                                                    |

Every context mutation includes `contextId` and `expectedWorkingHead`. The
runtime client mints a fresh `commandId` for each call and reuses it only for
its own transport retries. After a freshness failure, observe again and call
again.

Comparison classifies source changes as shared, already satisfied, adoptable,
convergent, composed, conflicted, or resolved. Merge in bounded pages of stable
coordinates, continuing from each returned working head. Commit takes no
selection; it consumes the whole local chain. Use a separate context when work
needs its own commit. An integration commit names its source event only after
all touched changes are accounted for. Push creates no ancestry event.

Managed file operations are semantic operations. Prefer the explicit batch
forms for refactors: moves keep identity across paths and repositories, and
copies mint a new identity while recording copy ancestry. Runtime
`fs.rename`/`fs.copyFile` and agent `move_file`/`copy_file` on managed files
also work, because the adapter resolves identity and routes them through these
commands before writing to disk. A shell copy, or a delete followed by a create,
loses that information.

Workspace skill discovery works the same way. Runtime `workspace.listSkills()`
and `workspace.readSkill(path)` read from the caller's verified context. The
terminal CLI uses `vibestudio agent skills ... --session NAME`, which passes
that session's context explicitly. Neither falls back to checkout files.
Catalog reads query top-level `SKILL.md` files directly with bounded fan-out, so
prompt setup in a large workspace cannot flood the control plane.

Branch on result/error discriminants such as `RevisionChanged`,
`CoupledGroupIncomplete`, `ConflictPresent`, `IntegrationIncomplete`,
`ScopeTooLarge`, and `IntegrityFailure`. Explanatory text is for humans, not
control flow. During recovery, keep the user's goal but re-check applicability,
liveness, dependencies, and publication reachability against the new working
head.

For panel and worker forks, prefer `forkPanel({ from, name, ... })` and
`forkWorker({ from, name, ... })`. They choose the destination section, so a
worker cannot accidentally land under `projects/`; for a trial run, use
`dryRun: true` rather than changing the project type. Use the generic
`forkProject` only when the destination path or project type is deliberately
part of an advanced lifecycle operation. Use `vcs.copy` when what you want is a
set of file copies with explicit ancestry. Dry-run unfamiliar worker forks and
pass a `classMap` when there are several Durable Object classes.

#### services.build.getBuildReport (recommended)

Compiles a panel against the context's current working head and returns the
structured build report. Pass the panel source path and the context ref. The
report contains `status`, top-level `diagnostics`, and per-target `builds`.
Diagnostics include source, severity, file, line, column, message, and optional
source context, and cover bundling, TypeScript, and static authority checks: a
statically known privileged call without a matching manifest request is
reported here. A request is not a grant; dynamic eval and method selection are
still checked at runtime. The report omits artifact manifests to stay compact.
Each target includes its immutable `buildKey`; use build provenance or metadata
inspection only when you need artifact details.

```
eval({ code: `
  return await services.build.getBuildReport(
    "panels/my-app",
    \`ctx:\${ctx.contextId}\`,
  );
`
})
```

This check creates no semantic event and publishes nothing. Use it as the fast
repair loop before commit; the protected push gate runs the same check on the
candidate. Fix every reported file with managed edits, then request a new report
for the same context.

`services.build.getBuild` returns a runtime bundle, not this combined
diagnostic report.

#### @workspace-extensions/typecheck-service (TypeScript-only check)

Installed panels, workers, extensions, and admitted eval sessions may call
`@workspace-extensions/typecheck-service.checkPanel` or its lower-level `check`
method. In eval, prefer `services.build.getBuildReport`: it is the build result
used by panel launch and includes every build target plus the static authority
diagnostics. The extension's TypeScript-only result does not replace it.

`checkPanel` returns `{ diagnostics, errorCount, warningCount }` and infers the
installed caller's context. An explicit `{ contextId }` must match that context.
To check another context, invoke the extension from an execution in that context;
the caller's materialization and compiler admission then share the same authority.

#### `verify({ operation: "test" })`

Agents run manifest-declared test suites through `verify`. It materializes the
conversation's context, builds a sealed test artifact, and reports runtime
identity, progress, cancellation, and bounded structured evidence. Browser
suites run as visible child panels of the Testbench panel with the full
production panel runtime. Workerd suites run as disposable worker entities with
the normal workerd compatibility surface. Neither needs native approval. Only a
suite declared with `runtime: "native"` runs through
`@workspace-extensions/test-runner.runNative` and requests the
`native.code.execute-tests` capability.

```
verify({ operation: "test", target: "packages/my-lib" })
```

For a single file or test name:

```
verify({
  operation: "test",
  target: "packages/my-lib",
  suite: "unit",
  file: "src/index.test.ts",
  testName: "handles empty input"
})
```

A failed run, or a run that discovers zero tests, returns an error result with
the structured report intact. The declared runtime is never guessed, and a
non-native suite never falls back to native execution. Do not replace `verify`
with generic `eval`, a shell command, or direct `extensions.invoke` calls.

### Browser Data

```typescript
import { browserData } from "@workspace/runtime";
```

Core method groups:

| Methods                                                                                                                  | Purpose                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `listImportHosts`, `listImportSources`, `previewImport`, `startImport`, `cancelImport`, `getImportJob`, `listImportJobs` | Discover sources and manage non-sensitive import jobs                            |
| `previewSensitiveImport`, `startSensitiveImport`, `observeSensitiveImport`, `cancelSensitiveImport`                      | Review aggregate counts and control one sealed, persistent protected-data import |
| `openBrowserPrivacyManager`                                                                                              | Open the host's protected-data manager; returns no vault rows                    |
| `listOpenTabs`, `openTabsAsPanels`                                                                                       | Preview source tabs and open selected HTTP(S) tabs as panels                     |
| `getBookmarks`, `addBookmark`, `updateBookmark`, `deleteBookmark`, `moveBookmark`, `searchBookmarks`                     | Manage bookmarks                                                                 |
| `getHistory`, `searchHistory`, `deleteHistoryEntry`, `deleteHistoryRange`, `clearAllHistory`                             | Manage browsing history                                                          |
| `getSitePreferences`, `setSiteZoom`, download and favicon methods                                                        | Manage browser chrome state                                                      |
| `exportBookmarks`                                                                                                        | Export bookmarks                                                                 |

Use `await help("browserData")` for the full live API. Site permissions are
approval records, not browser data. Imported profiles and their paths are never
exposed.

`startImport` is keyed by source and deterministic: repeating an import updates
changed records and adds new ones without duplicates. The runtime client always
goes through the broker selected in the manifest, so imported history and visits
recorded by Vibestudio are rows in the same BrowserDataDO. Do not resolve or call
BrowserDataDO directly from a panel or worker.

`openTabsAsPanels` creates panels on every call. By default it creates a new
workspace root with one collection per imported browser window; pass
`destination: "caller"` to attach them to the calling panel instead.

#### Discover import sources

```
eval({ code: `
  import { browserData } from "@workspace/runtime";
  const hosts = await browserData.listImportHosts();
  for (const host of hosts) {
    console.log(host.displayName, await browserData.listImportSources(host.hostId));
  }
`
})
```

#### Import from Chrome

```
eval({ code: `
  import { browserData } from "@workspace/runtime";
  const hosts = await browserData.listImportHosts();
  const host = hosts.find(h => h.connected);
  if (!host) { console.log("No import host connected"); return; }
  const sources = await browserData.listImportSources(host.hostId);
  const chrome = sources.find(source => source.browser === "chrome");
  if (!chrome) { console.log("Chrome not found"); return; }
  const job = await browserData.startImport({
    hostId: host.hostId,
    sourceId: chrome.sourceId,
    dataTypes: ["bookmarks", "history"],
  });
  console.log("Import job:", job.jobId, job.phase);
`
})
```

#### Search and export

```
eval({ code: `
  import { browserData } from "@workspace/runtime";
  const bookmarks = await browserData.searchBookmarks("github");
  console.log("Found", bookmarks.length, "bookmarks");
  const html = await browserData.exportBookmarks("html");
  console.log("Exported", html.length, "bytes of HTML");
`
})
```

### Panel Lifecycle

`openPanel` and panel handles run over RPC through the host and work in panels,
workers, **and server-side eval** (they are part of the portable runtime
surface). You can drive the panel lifecycle from eval, panel code, or an
`inline_ui`/`feedback_custom` component.

#### First launch

```tsx
import { openPanel } from "@workspace/runtime";
// Shares your context, so the panel runs its working code and later rebuilds
// pick up your edits. Pass { ref: "main" } to run protected main instead.
const handle = await openPanel("panels/my-app", { contextId: ctx.contextId });
const observation = await handle.observe();
const snapshot = await handle.snapshot();
return { panelId: handle.id, observation, snapshot };
```

A resolved `openPanel()` and `observation.phase === "ready"` show only that the
panel booted, not that it renders correctly. Never report a
create/fork/open/rebuild task as successful until `snapshot()` returns rendered
content for the same `panelId`, `attemptId`, `runtimeEntityId`, and `buildKey`.

#### Rebuild after edits

```tsx
import { openPanel } from "@workspace/runtime";
// Rebuilds from the panel's explicit ref if it was pinned, otherwise from its
// own context. Sharing ctx.contextId lets rebuild pick up edits made here.
const handle = await openPanel("panels/my-app", { contextId: ctx.contextId });
const observation = await handle.rebuild();
console.log(
  observation.phase,
  observation.effectiveVersion,
  observation.buildKey,
);
```

When iterating on an open panel after code changes, keep its handle in
`scope` and reuse it:

```ts
const observation = await scope.panel.rebuild();
```

The notebook heap is not replaced between evals; its idle lease lasts 30
minutes after execution and cancellation settle. A panel handle in scope also
survives a kernel restart: the recovery snapshot stores its id and reacquires
it by id. Reopening the source instead creates duplicates and can evict the
panel you meant to inspect.

`rebuild()` transactionally prepares a new immutable attempt, activates it
without adding a history entry, and waits for its boot handshake. It affects
only the target, not its children. `handle.reload()` reloads the current
renderer and also waits until it is boot-ready.

Lifecycle calls return a `PanelObservation` with `phase`, `attemptId`,
`runtimeEntityId`, `requestedRef`, `effectiveVersion`, and `buildKey`. Use
`handle.observe()` for a cheap current read, `handle.diagnose()` for a bounded
post-mortem packet, and `handle.snapshot().document` for rendered content tied
to the observed attempt. A ready observation without a matching snapshot is an
incomplete verification; it does not show that the panel works.

---

## Web Tools

### web_search

Search the web for current or source-backed information. If the agent's
configured primary provider is OpenAI Codex, the search uses the connected Codex
subscription and returns cited answers with inline source markers; other
providers use the configured search backend. Batch related queries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `queries` | string[] | Yes | One to five related search queries |

When the configured primary provider is OpenAI Codex, the tool schema also
exposes:

| Name                  | Type                            | Required | Description                            |
| --------------------- | ------------------------------- | -------- | -------------------------------------- |
| `search_context_size` | `low` \| `medium` \| `high`     | No       | Search context size (default `medium`) |
| `freshness`           | `cached` \| `indexed` \| `live` | No       | Freshness mode (default `live`)        |

### web_fetch

Fetch and process content from a URL.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | Absolute HTTP(S) URL to fetch |
| `session` | `public` \| `browser` | No | Cookie-free public Chromium session (default), or approval-gated imported browser session |

The full extracted page is cached in the blobstore. Use the returned digest
with `web_read` to read beyond the inline head excerpt.

Host RPC descriptors are exported by `@vibestudio/service-schemas/mainRpc`: import `mainRpcMethods` for the calls above.
