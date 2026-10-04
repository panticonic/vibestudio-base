# Agent Tools Reference

Your working directory is the **context folder** — an isolated copy of the workspace.

**CRITICAL RULES:**

- All file paths are **relative to your working directory** (e.g., `panels/my-app/index.tsx`)
- **NEVER** use host absolute paths (e.g., `/home/.../workspace/panels/...`). Runtime `fs.*` accepts context-root absolute paths like `/panels/my-app/index.tsx`, but prefer `panels/my-app/index.tsx` in examples and source edits.
- **NEVER** use `Bash` for git operations, file listing, or file creation — use the structured tools
- In eval, `rpc`, `services`, `fs`, `ctx`, `scope`, `scopes`, `db`, `help` (and, in agent eval, `chat`) are **injected free variables** — do **not** import them. Raw service catalog calls always work as `rpc.call("<svc>.<method>", [args])`; `services.<svc>` is convenience sugar and may be an ergonomic runtime client when the name collides (`services.workers` is `workers`). For workspace/npm **packages**, import the functions in each invocation that uses them (`import { prepareProjects } from "@workspace-skills/workspace-dev"`). Static imports and literal dynamic imports use the same per-owner loader; see the [canonical import contract](../sandbox/EVAL.md#imports).

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

Search file contents. Grep is literal by default; use that for code snippets,
identifiers, function calls, paths, and punctuation. Set `literal: false` only
when the pattern is an intentional valid regex.

```
Grep({ pattern: "useState", path: "panels/my-app" })
Grep({ pattern: "openPanel(", path: "workspace/packages/runtime" })
Grep({ pattern: "import.*runtime", path: "panels/my-app", literal: false })
```

`Read`, `Glob`/`find`, and `Grep` may use the optional native
`@workspace-extensions/file-tools` accelerator. It is never a liveness
dependency: every invocation has a 15-second deadline, inherits tool
cancellation, and falls back to the context filesystem (or the host
filesystem service for grep). A fallback is announced as tool progress and
recorded in `details.extensionFallback` with the exact operation and reason,
for example `file-tools find timed out after 15000ms`. Do not wait on or retry
a stalled helper; continue from the successful fallback result. Abort remains
an abort and is never converted into a fallback.

The context filesystem transport has no invented per-operation deadline. Its
RPC remains owned by the enclosing tool/run and follows that caller's explicit
cancellation. A slow valid filesystem operation therefore cannot be relabeled
as an infrastructure failure merely because a fixed wall-clock threshold
elapsed. This is distinct from a normal missing path (a successful discovery
diagnostic) and from explicit tool cancellation.

The 15-second values above and below bound one replaceable optimization or one
durably retried delivery attempt; they are not RPC operation deadlines. The
logical filesystem operation, eval run, system-test run, and durable delivery
remain alive under caller cancellation or durable state respectively.

Ordinary in-process agent tools have no implicit wall-clock deadline. They run
for as long as their work requires and receive cancellation only when the
owning agent turn is explicitly cancelled. A tool or deferred protocol may own
an explicit deadline when that deadline is part of its semantics; for example,
`eval` accepts an opt-in `timeoutMs` and delivers long-running results
asynchronously.

Channel trajectory terminals and other structured envelopes use a durable
delivery outbox with a 15-second transport attempt deadline. An unavailable
or wedged participant therefore releases the channel alarm, records the exact
delivery failure, and retries from the outbox; it cannot indefinitely block
the caller's terminal tool result or unrelated channel work.

Protected publication settles the package graph and effective-version index
before speculative cache warming. Resolving or opening a newly published unit
therefore waits only for its graph identity and its own on-demand build; a slow
unrelated background build cannot make the new unit disappear or stall every
filesystem/VCS request behind global build settlement.

---

## Creating Projects

Creation is stage one: a context-local preparation edit. It never commits,
pushes, activates a runtime, or grants authority. Stage two is deliberate
review, exact-context verification, and ordinary VCS commit/push. Read
[PROJECTS.md](PROJECTS.md) for the complete policy example and receipt contract.

### Preparation API

- `prepareApplication({ name, title?, icon?, authority })` prepares a React
  panel, SQLite DO store, protocol, singleton, and config in one edit.
  The generated two-method record store is editable starting code, not a fixed
  application API. Extend its data, methods, reviewed policies, and UI to deliver
  the user's requested features before final verification/publication.
  `authority` is the required `ApplicationAuthorityPolicy`: rationale, complete
  panel/worker manifests, service principals/binding/notability, and both complete
  literal record-method contracts. No request or policy is inferred.
- `prepareProjects(projects)` prepares independent repositories in one edit
  and returns an array. Each input has `projectType`, `name`, optional
  `title`, `icon`, `template`, and portable panel `website` entry options.
  Executable inputs require `authority` and `authorityReason`; the
  `durable-service` template also requires `methods`.
- `forkProject({ from, to, authority?, authorityReason?, dryRun?, rewrite?, classMap? })`
  prepares copied source. `forkPanel` and `forkWorker` take `from`, `name`,
  required `authority` and `authorityReason`, optional `title`, `dryRun`,
  and (worker only) `classMap`. Executable forks replace the copied ceiling
  with explicit policy; they do not inherit authority silently.
  Dry runs perform preflight without mutation.

Supported repository kinds are `panel`, `worker`, `package`, `skill`,
and `project`. Location is identity; `projectType` cannot override an existing
repository's kind. Use repo-local `SKILL.md` for its guidance, not a new skill
repository. Use ordinary writes under `projects/` for private scratch content.

Import preparation functions in each eval invocation. Author the policy for
the real task before calling them; do not use an example envelope as an
automatic solution to an authority diagnostic.

### Receipts and review

A prepared unit returns `{ created, files, preflight, preparation, authorityReview }`.
A connected app returns `{ panel, worker, service, preparation, authorityReview }`,
not an array. Keep it in `scope.prepared`; the panel path is
`scope.prepared.panel.created` for an application, or
`scope.prepared[0].created` for the first independent unit.
The preparation receipt identifies the exact context working head and explicitly
reports `publication: "unchanged"` and `liveRuntime: "unchanged"`.

The authority review packet shows the requested manifest and rationale;
application review additionally exposes service and receiver choices.
`AUTHORITY.md` records the supplied executable rationale. These are review
evidence, not grants. Verify the actual current source after edits.

Preflight proves mutation-free manifest, source, and dependency checks;
it does not prove semantic builds or authorize publication. Its pending
semantic gate is discharged by exact build verification and protected push.
On `ProjectPreflightError.errorData`, inspect each dependency issue's file,
line, import syntax, coordinate, required manifest field, and accepted package
coordinates. Production imports belong in dependencies/peerDependencies;
test-only and type-only imports may use devDependencies. Repair the named
source/manifest; do not probe unrelated fork sources.

Fork rewriting owns package name, entry, title, and class metadata structurally.
It does not apply worker source-string replacements to an already-rewritten
manifest. Inspect dry-run rewrites/warnings and use an explicit class map when
multiple classes need renaming.

### Verify and publish separately

Review the complete requested authority against the application's intended
effects, resources, callers, website access, and data sensitivity. Empty
requests are deliberate; blanket context-boundary or clone requests are never
added by scaffolding. Use exact `verify` targets, then compare with main,
commit the reviewed complete chain, and push its exact event through ordinary
VCS. See [WORKFLOW.md](WORKFLOW.md#development-loop). Publication has one
existing protected gate and user decision, not a new preparation approval path.

Preparation, publication, and activation are distinct phases. A later failure
does not undo an earlier edit. Never call either preparation API again to recover
an existing candidate. Inspect current VCS status and destinations after a lost
edit response; for publication failures, use the normal typed VCS retry policy
and exact receipts. There is no scaffold-specific publication recovery API.

---

## eval

Execute TypeScript/JavaScript code server-side in your own notebook sandbox (a
per-agent EvalDO). It runs even when no panel is open. The same live heap is
retained throughout admitted execution and cancellation, then for 30 minutes
of inactivity; every cell renews the idle lease.
After an unavoidable restart, `[kernel] Restarted` reports exact restored and
lost scope keys. In eval, `rpc`, `services`, `fs`, `ctx`, `scope`, `scopes`,
`db`, `help` (and, in agent eval, `chat`) are injected free variables; reach
raw service catalog methods through `rpc.call("<svc>.<method>", [args])`. Use
rich runtime bindings (`workers`, `vcs`, `fs`, etc.) directly for normal
workspace operations; `services.<svc>` is convenience sugar for non-colliding
service names. Do **not** import the injected names from `@workspace/runtime`.

**IMPORTANT:**

- Static imports and literal dynamic imports load workspace/npm packages through the same per-owner loader. Import the functions in every invocation that uses them; retain values and handles explicitly in `scope`. See the [canonical import contract](../sandbox/EVAL.md#imports).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | string | Yes | Code to execute |
| `syntax` | `"javascript"` \| `"typescript"` \| `"tsx"` \| `"jsx"` | No | Syntax mode (default: `"tsx"`) |
| `imports` | `Record<string, string>` | No | Packages to build on-demand. Workspace packages: `"latest"` or a git ref. npm packages: `"npm:<version>"` (e.g. `"npm:^4.17.21"`, `"npm:latest"`) |
| `timeoutMs` | positive integer | No | Optional wall-clock deadline in milliseconds; omitted means no deadline |

For inline code with relative imports, `sourcePath` (or the inline `path` hint)
is the virtual location of the eval module. It is not the module being imported:
to import `./index.ts`, use its directory or a distinct filename such as
`src/eval-check.ts`, not `src/index.ts` (which would be a self-import).

### Panel APIs

`createPanelSlot`/`openPanel`/`getPanelHandle`/`panelTree` are part of the **portable runtime surface** — importable from `@workspace/runtime` (and injected ambiently) in panel, worker, **and server-side eval**. They are host-mediated over RPC: in eval they create/inspect panels via the server. To change a panel's state from eval, use the returned `PanelHandle.stateArgs.set/get`; do not resolve the internal `workspace.state` service yourself. A handful of panel-only extras (`panel.focusPanel`, `buildPanelLink`, `panel.reopen`, `panel.stateArgs`, `adblock`, `journal.Journal`, `agentApi`) are NOT in the eval surface — those need a real panel host:

| API                              | Description                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPanelSlot(source, opts?)` | Commit an unloaded panel and return its durable handle without allocating a presentation lease or waiting for application readiness                                    |
| `openPanel(source, opts?)`       | Open any panel — URLs become browser panels, source paths open workspace panels (eval too); readiness is observed until ready, failed, stopped, or caller cancellation |
| `buildPanelLink(source, opts)`   | Build a URL for panel navigation (panel/component code — not in eval)                                                                                                  |
| `panel.focusPanel(panelId)`      | Focus an existing panel by ID (panel/component code — not in eval)                                                                                                     |
| `panel.switchContext(id, opts?)` | Explicitly move this panel to an already-created workspace branch; state args cannot select a context                                                                  |

`await openPanel(...)` returns only after the exact runtime attempt is
application boot-ready; resolve/build/host/boot failures reject with
`PanelOperationError` and structured provenance. The underlying tree slot is
committed immediately and its build/host/boot lifecycle continues
asynchronously, so a broken panel cannot block owner seeding or unrelated tree
operations; the public promise observes that lifecycle without inventing a
wall-clock failure. Pass an `AbortSignal` when the caller owns cancellation. Use
`createPanelSlot(...)` when the operation's authoritative result is the
committed navigation receipt and observe the returned handle separately if
readiness matters. Pass a stable `operationId` whenever the surrounding
workflow may retry so creation resolves to the same durable slot.
The retry identity also includes `source`, `contextId`, `parentId`, and `ref`;
an exact retry resumes the existing slot while a logically different open gets
a different identity. Do not combine `operationId` with `slug`. All
readiness-bearing handle methods accept caller cancellation: pass `{ signal }`
to `snapshot`, `reload`, and `rebuild`, or include `signal` in the existing
options for `navigate` and `focus`.

`openPanel(source)` creates a new panel for
main/pushed code. To run code from the current context branch, pass
`ref: \`ctx:${ctx.contextId}\``explicitly (and usually`contextId: ctx.contextId`for matching storage).`contextId` alone only selects
the panel's filesystem/storage context; it does not select code.

In **eval**, `rpc` is the same portable client shape used by panels and workers:
`rpc.call(target, method, args)`. Raw server services target `"main"`, for
example `rpc.call("main", "build.getBuild", ["panels/my-app"])` or
`chat.rpc.call("main", "build.recompute", [])`.

Project discovery is direct: `await workspace.projects()` lists `projects/*`
repository roots, and `await workspace.projectForPath(path)` returns the owning
project or `null`. These are methods on `workspace`, not a nested namespace.

### Using extensions

Extensions are **declared** in `meta/vibestudio.yml` under `extensions:`. That declaration is the only way to add or remove one. To start using an extension, add it to the `extensions:` list in `meta/vibestudio.yml`; saving that change (a gated meta write) raises one joint approval covering every newly-declared extension. Once declared and approved, call it; an `onInvoke` extension starts on demand. **From eval**, invoke an extension method via
`services.extensions.invoke(name, "method", [args])` (the underlying RPC); list
declared extensions with `services.build.listUnits()` and filter `kind === "extension"`. **In panel/component code**,
use the typed client `extensions.use(name)` instead (panel-runtime sugar over the
same RPC). Individual extension methods can still request their own approvals when
the operation needs one, such as running tests.

`build.listUnits()` rows expose `name` (the canonical scoped package name),
`source` (for example `extensions/test-runner`), `displayName`, and build/approval
readiness. Invocation accepts the canonical name, source path, or its exact final
segment; prefer the canonical name in durable code and docs. Display titles and
guessed abbreviations are not identifiers.

The panel-runtime `extensions.use(name)` is synchronous and returns a method
proxy; do not `await` it and do not call `.catch(...)` on it. Catch the method
call instead: `await extensions.use(name).method(...).catch(...)`. The eval form
`services.extensions.invoke(name, "method", [args])` returns the result promise
directly — `.catch(...)` it as usual. Either form fails with `ENOEXT` if the
extension is not declared, or `ENOTREADY` if it is still starting. If you need an
extension that isn't declared yet, edit `meta/vibestudio.yml`.

Extension methods normally use unary RPC and must return JSON-serializable values. If an extension method returns a `Response` or `ReadableStream`, declare it when creating the client so the runtime uses streaming RPC end-to-end. Streaming `Response`/`ReadableStream` methods need the panel-runtime typed client (`extensions.use`), so this runs in panel/component code, not server-side eval:

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

To discover extension identities from eval, read the ordinary unit inventory:

```ts
eval({
  code: `
  return (await services.build.listUnits())
    .filter((unit) => unit.kind === "extension")
    .map(({ name, source, displayName, status }) => ({ name, source, displayName, status }));
`,
});
```

This is build/approval readiness, not a process inventory. A cold `onInvoke`
extension need not already have a running process: its ordinary invocation
boundary checks approved source, builds, activates, and awaits the result.

If an extension isn't declared, adding it to `meta/vibestudio.yml` raises a joint approval. If the user denies it, stop and report that the extension is required for the requested operation.

#### Shell command execution

Use the shell extension's `exec` method for a finite command whose complete
stdout/stderr belongs in one structured result. Prefer argv mode
(`shell: false`) so arguments are not reinterpreted by `/bin/sh`:

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
`contextAttachToken`. Do not use `timeout`, `cancelled`, or a shell command
string as aliases. The result is `{ exitCode, stdout, stderr, durationMs,
timedOut?, truncated? }`.

`exec` is protected by the shell extension's manifest-declared
`native.shell.execute` capability. The attributed panel, worker, DO, or agent
eval remains the authority principal even though the native extension performs
the spawn. A call that cannot acquire authority is an attribution/propagation
defect; do not work around it with a temporary panel or another process path.

**Pre-injected** (use directly, do NOT import):

| Variable    | Description                                    |
| ----------- | ---------------------------------------------- |
| `contextId` | Current agent context ID for scoped operations |

### RPC Services

From eval, prefer the ergonomic runtime clients (`workers`, `vcs`, `fs`, etc.)
for normal workspace operations. Use raw `rpc.call("<svc>.<method>", [args])`
when following a `docs_open` service catalog entry exactly. `services.<svc>` is
a convenience namespace for non-colliding service names, but rich runtime
bindings win on collision: `services.workers` is the same ergonomic `workers`
client, not the raw `workers` service catalog.

#### Worker lifecycle (portable typed client)

Launch, list, and retire regular workers through the portable typed `workers`
client. It is available to panels, workers, DOs, and eval and delegates to the
canonical runtime entity API. Raw `runtime.*` calls remain available for
advanced and non-worker entity operations.

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
`ref` selects the verified initiating caller's semantic workspace independently
of that partition. Pass `ref: "ctx:<contextId>"` to build from another context,
or `ref: "main"` to select protected main deliberately. Clones build from their
cloned semantic frontier; reserved activation defaults to its retained context.

Launch/list/retire: `workers.create(source, { key, contextId, env, stateArgs, ref? })` creates an owned regular worker; `workers.createDurableObject(source, className, { key, contextId, stateArgs, ref? })` creates an owned disposable Durable Object. Both return `{ id, targetId, … }` handles accepted by `workers.destroy(handleOrId)`. `workers.resolveService(...)` and `workers.resolveDurableObject(...)` address existing targets but never transfer lifecycle ownership. `workers.list()` lists live regular worker **instances**; `build.listUnits()` is the declared-source/build-readiness view, while `runtime.supervision.list()` returns exact live driver identities. Discover sources with `workers.listSources()` and use each row's `entry` instead of guessing `index.ts`. The raw `runtime.createEntity/listEntities/retireEntity` methods are the canonical entity-lifecycle lower layer. To duplicate or tear down a whole context's durable state, use `runtime.cloneContext(...)` and `runtime.destroyContext(...)`; low-level cloneDO/destroyDO primitives are server-internal. See [WORKERS.md](WORKERS.md) for details.

For app data, prefer a Durable Object service over eval `db` or ad hoc files:
the DO owns SQLite through `this.sql`, the live service declaration sets
`authority.principals`, and each method declares its `@rpc` receiver policy.
Callers use `workers.resolveService(protocol, objectKey?)` plus
`rpc.call(targetId, method, args)`. See
[WORKERS.md](WORKERS.md#durable-object-backed-app-databases).

#### Semantic workspace version control

Workspace VCS is one semantic graph. A state is a committed event or a local
work application; repositories, paths, and file listings are views over that
state. Commands, work units, changes, applications, decisions, events, files,
and content mappings are directly walkable.

Read the canonical [Vibestudio VCS skill](../vibestudio-vcs/SKILL.md) before
using this surface. Its references define state nodes, merge decisions,
whole-chain commit/discard, file identity, counteractions, provenance reads,
and typed recovery.

Core routing:

| Intent                       | Runtime surface                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orient in a context          | `vcs.status()` uses the runtime's bound semantic context and returns committed event, working head, main relation, and local counts                                                  |
| Compare committed work       | `vcs.compare` from an exact target state to one source event                                                                                                                         |
| Account for incoming changes | `vcs.merge` over stable coordinates; review intents/composed results and resolve conflicts with `theirs`, `ours`, or `current`                                                       |
| Commit coherent context work | `vcs.commit` consumes the complete local application chain                                                                                                                           |
| Publish committed work       | `vcs.push` gates the affected build/typecheck closure, then advances protected main to one exact committed event                                                                     |
| Read or list managed files   | `vcs.readFile` and `vcs.listFiles` at an event/application state                                                                                                                     |
| Move managed identities      | `vcs.move` preserves file or repository identity                                                                                                                                     |
| Copy managed content         | `vcs.copy` mints file identity and records immediate copy provenance                                                                                                                 |
| Import external content      | `vcs.importSnapshot` records one exact complete snapshot and atomically returns its event/application/work-unit/repository/snapshot evidence; it does not import per-path authorship |
| Undo named changes           | `vcs.revert` authors explicit counteractions                                                                                                                                         |
| Explain history or content   | `vcs.inspect`, `vcs.neighbors`, `vcs.history`, and `vcs.blame`                                                                                                                       |
| Validate a working build     | use the ordinary typecheck, test, and build services for the context                                                                                                                 |

Every context mutation includes `contextId`, `expectedWorkingHead`, and a stable
`commandId`. A command ID identifies
one canonical request digest. Retry the identical request with the same ID only
when completion is uncertain; after changing any field or receiving a freshness
failure, observe again and use a new ID.

Comparison returns source changes classified as shared, already satisfied,
adoptable, convergent, composed, conflicted, or resolved. Merge bounded stable-coordinate pages and continue from
each returned working head. Commit accepts no selection: it consumes the whole
local chain. Use another context when work needs an independent commit boundary.
An integration commit names the exact source event only after its touched
changes are accounted for. Push creates no ancestry event.

Managed file operations are semantic operations. Prefer the explicit batch
forms for refactors: moves preserve identity across paths and repositories;
copies mint identity while preserving copy ancestry. Managed runtime
`fs.rename`/`fs.copyFile` and agent `move_file`/`copy_file` are acceptable
because the adapter resolves exact identity and routes through these commands
before projection. A shell copy or delete-plus-create
cannot express those facts.

Workspace skill discovery follows the same rule. Runtime
`workspace.listSkills()` and `workspace.readSkill(path)` read through the
caller's verified ambient context. The terminal CLI uses
`vibestudio agent skills ... --session NAME`, which supplies that durable
session's exact context explicitly. Neither surface falls back to checkout
files. Catalog reads query top-level `SKILL.md` files directly and bound
semantic receiver fan-out, so a large workspace cannot turn prompt setup into
an unbounded burst of control-plane calls.

Branch on result/error discriminants such as `RevisionChanged`,
`CoupledGroupIncomplete`, `ConflictPresent`, `IntegrationIncomplete`,
`ScopeTooLarge`, and `IntegrityFailure`.
Explanatory text is for humans, not control flow. Preserve the user's semantic
goal across recovery, but rederive applicability, liveness, dependencies, and
publication reachability at the newly observed working head.

For panel and worker forks, prefer `forkPanel({ from, name, ... })` and
`forkWorker({ from, name, ... })`. They own the destination section and remove
the possibility of accidentally planning a worker under `projects/`; isolation
comes from `dryRun: true`, not from changing project type. Use generic
`forkProject` only when the destination path/project type is deliberately part
of an advanced lifecycle operation. Use `vcs.copy` when the desired fact is
specifically a set of file copies with explicit ancestry. Dry-run unfamiliar
worker forks and provide a `classMap` when multiple Durable Object classes
exist.

#### services.build.getBuildReport (recommended)

Compile a panel against the current context working head and return the
canonical structured build report. Pass the panel source path and the exact
context ref. The report contains `status`, top-level `diagnostics`, and
per-target `builds`; diagnostics include source, severity, file, line, column,
message, and optional source context. They combine bundling, TypeScript, and
static authority checks; a statically known privileged call without a covering
manifest request is reported here. A request is not a grant. Dynamic eval and
method selection remain subject to runtime authority checks. The routine
report intentionally omits artifact manifests so compiler feedback remains
compact and structurally available through eval. Each target includes its
immutable `buildKey`; use build provenance or metadata inspection only when
artifact details are needed.

```
eval({ code: `
  return await services.build.getBuildReport(
    "panels/my-app",
    \`ctx:\${ctx.contextId}\`,
  );
`
})
```

This local check neither creates a semantic event nor publishes source. It is
the fast repair loop used before commit; the protected push gate repeats the
same check against the exact candidate. Fix every reported file through
managed edits, then request a new report for the same context.

`services.build.getBuild` returns a runtime bundle; it does not provide this
combined pre-commit diagnostic report.

#### @workspace-extensions/typecheck-service (TypeScript-only check)

Installed panels, workers, extensions, and admitted eval sessions may invoke
`@workspace-extensions/typecheck-service.checkPanel` or its lower-level `check`
method. Prefer `services.build.getBuildReport` in eval because it is the
canonical build result used by panel launch and includes every build target
and the static authority diagnostics. The extension's TypeScript result does
not replace that combined pre-commit report.

`checkPanel` returns `{ diagnostics, errorCount, warningCount }` and infers the
installed caller's context. Pass `{ contextId }` only when intentionally
checking a different context.

#### `verify({ operation: "test" })`

Agents run manifest-declared suites through the first-class verification
boundary. It materializes the exact conversation context, builds a sealed test
artifact, and preserves runtime identity, progress, cancellation, and bounded
structured evidence. Browser suites run as visible child panels of the ordinary
Testbench panel with the complete production panel runtime. Workerd suites run
as disposable complete worker entities with the normal workerd compatibility
surface. Neither route requires native approval.
Only a suite explicitly declared with `runtime: "native"` reaches
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

A failed run or zero discovered tests is an explicit error result with its
structured report intact. The declared runtime is never guessed and never
falls back to native execution. Do not replace this boundary with generic
`eval`, a shell command, or direct `extensions.invoke` plumbing.

### Browser Data

```typescript
import { browserData } from "@workspace/runtime";
```

Core method groups:

| Methods                                                                                                                  | Purpose                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `listImportHosts`, `listImportSources`, `previewImport`, `startImport`, `cancelImport`, `getImportJob`, `listImportJobs` | Discover sources and manage non-sensitive import jobs                        |
| `previewSensitiveImport`, `startSensitiveImport`, `observeSensitiveImport`, `cancelSensitiveImport`                      | Review aggregate counts and control one durable sealed protected-data import |
| `openBrowserPrivacyManager`                                                                                              | Open the host-owned protected-data manager; returns no vault rows            |
| `listOpenTabs`, `openTabsAsPanels`                                                                                       | Preview source tabs and open selected HTTP(S) tabs as panels                 |
| `getBookmarks`, `addBookmark`, `updateBookmark`, `deleteBookmark`, `moveBookmark`, `searchBookmarks`                     | Manage bookmarks                                                             |
| `getHistory`, `searchHistory`, `deleteHistoryEntry`, `deleteHistoryRange`, `clearAllHistory`                             | Manage browsing history                                                      |
| `getSitePreferences`, `setSiteZoom`, download and favicon methods                                                        | Manage browser chrome state                                                  |
| `exportBookmarks`                                                                                                        | Export bookmarks                                                             |

Use `await help("browserData")` for the complete live surface. Site permissions
are approval records, not browser-data records, and imported profiles and paths
are never exposed.

`startImport` is source-keyed and deterministic. Repeat imports update changed
records and add new records without duplicating canonical data.
The runtime client always uses the manifest-selected broker: imported history
and visits recorded by Vibestudio are rows in the same canonical BrowserDataDO.
Do not resolve or call BrowserDataDO directly from a panel or worker.
`openTabsAsPanels` is an action and creates panels on each call. Its default
destination is a new workspace root containing one collection per imported
browser window; pass `destination: "caller"` to attach it to the invoking panel.

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

`openPanel` and panel handles are host-mediated over RPC and work in panel,
worker, **and server-side eval** (they're part of the portable runtime surface).
You can drive panel lifecycle from eval, panel code, or an
`inline_ui`/`feedback_custom` component:

#### First launch

```tsx
import { openPanel } from "@workspace/runtime";
// Opens the main/pushed build. Plain openPanel() does not infer code provenance
// from your contextId; pass { ref: `ctx:${contextId}` } when intended.
const handle = await openPanel("panels/my-app");
const observation = await handle.observe();
const snapshot = await handle.snapshot();
return { panelId: handle.id, observation, snapshot };
```

`openPanel()` resolving and `observation.phase === "ready"` establish boot
readiness only. They are not rendered verification. Never report a
create/fork/open/rebuild task as successful until `snapshot()` returns rendered
content for the same `panelId`, `attemptId`, `runtimeEntityId`, and `buildKey`.

#### Rebuild after edits

```tsx
import { openPanel } from "@workspace/runtime";
// Rebuilds the panel's current build ref: explicit ref if the panel was pinned,
// otherwise main. It does not infer ctx:<contextId> from the panel context.
const handle = await openPanel("panels/my-app");
const observation = await handle.rebuild();
console.log(
  observation.phase,
  observation.effectiveVersion,
  observation.buildKey,
);
```

When iterating on an already-open panel after code changes, keep its live handle
and stable id together:

```ts
const handle = scope.panelHandle ?? getPanelHandle(scope.panelId);
scope.panelHandle = handle; // live across cells while this EvalDO kernel is warm
scope.panelId = handle.id; // durable identity for cold recovery
const observation = await handle.rebuild();
```

The live notebook heap is not replaced after each eval; its idle lease lasts 30
minutes after admitted execution and cancellation settle. Its durable recovery snapshot contains only exact
data and never reconstructs class instances, so a restarted kernel rehydrates
`panelId` and reports `panelHandle` as lost. Reconstruct from the id only in
that case. Reopening the source instead creates duplicates and can evict the
panel you meant to inspect. `rebuild()` transactionally prepares a new immutable attempt,
activates it without adding a history entry, and waits for its boot handshake.
It is target-only and does not recurse into children. `handle.reload()` reloads
the current renderer and also waits for boot-ready.

Lifecycle calls return `PanelObservation`, including `phase`, `attemptId`,
`runtimeEntityId`, `requestedRef`, `effectiveVersion`, and `buildKey`. Use
`handle.observe()` for a cheap current read, `handle.diagnose()` for a bounded
post-mortem packet, and `handle.snapshot().document` for rendered content tied
to the observed attempt. A ready observation without a matching snapshot is an
incomplete verification result, not permission to claim that the panel works.

---

## Web Tools

### web_search

Search the web for current or source-backed information. Agents whose configured
primary provider is OpenAI Codex use the connected Codex subscription and return
cited answers with inline source markers; other providers use the configured
search backend. Batch related queries.

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
