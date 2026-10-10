# Authoring an Extension

## Workspace layout

```
workspace/extensions/
└── hello/
    ├── package.json                   # manifest with vibestudio.extension
    └── index.ts                       # entry — exports activate(ctx)
```

The layout matches `workspace/panels/` and `workspace/workers/`. Each extension
is a workspace unit; the build graph finds it by the `vibestudio.extension` block
in `package.json`.

External extensions are cloned into the same tree at install time. There is no
per-user `installed/` directory.

## Manifest

```json
{
  "name": "@workspace-extensions/hello",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "vibestudio": {
    "displayName": "Hello",
    "icon": "👋",
    "entry": "index.ts",
    "sourcemap": true,
    "extension": {
      "activationEvents": ["*"],
      "dependencyMode": "auto"
    },
    "dependencyResolution": {
      "overrides": {
        "problem-dependency": "1.2.3"
      }
    }
  },
  "dependencies": {
    "@workspace/runtime": "workspace:*"
  }
}
```

### Required fields

| Field                                   | Notes                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                                  | Convention: `@workspace-extensions/<short-name>` for workspace-internal extensions. Used as the install key and the argument to `extensions.use(...)`. |
| `type`                                  | Must be `"module"`. Extensions are loaded as ESM.                                                                                                      |
| `private`                               | Must be `true`. Workspace-internal packages are not publishable.                                                                                       |
| `vibestudio.entry`                      | Source entry, default `index.ts`. You ship TypeScript source; the build produces the bundle.                                                           |
| `vibestudio.sourcemap`                  | Must be `true` in v1 (inline maps; the build refuses to disable them).                                                                                 |
| `vibestudio.extension`                  | Its presence marks the unit as an extension. It must be the only kind block (no `vibestudio.worker` or `vibestudio.panel`).                            |
| `vibestudio.extension.activationEvents` | Exactly `["*"]` (start with the workspace) or `["onInvoke"]` (build after approval, start on first use).                                               |

### External dependencies

Declare external packages, overrides, and patches as described in [workspace
dependency resolution](../workspace-dev/DEPENDENCIES.md) (Build V2 handles
them). Do not use package-manager resolution fields. Patches apply to the build
dependency environment and, for a declared root that stays external, to the
runtime install. Overrides and patches are part of both cache keys, so changing
one creates a fresh environment.

### Optional fields

| Field                                 | Default      | Notes                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vibestudio.displayName`              | package name | Human-readable name shown in the units panel.                                                                                                                                                                                                                |
| `vibestudio.icon`                     | kind icon    | One emoji or a safe unit-relative image path (max 1 MiB). Use `prepareUnitIcon` when preparing files or `setUnitIcon` for an existing unit; catalog IDs go to those APIs, not into the manifest. See the [icon guide](../workspace-dev/references/icons.md). |
| `vibestudio.extension.dependencyMode` | `"auto"`     | `"auto"` bundles plain JS deps and externalizes native/WASM ones. `"bundle"` forces bundling. `"external"` forces runtime install and load.                                                                                                                  |

Use `activationEvents: ["onInvoke"]` when the API is only needed on demand,
especially if the extension starts native child processes or uses a lot of
memory. A call waits for that extension to activate or recover from a crash. It
does not start other extensions, and it does not replay a failed method call, so
non-idempotent methods are safe. Use `["*"]` only when the extension must run
background work before anyone calls it.

### Validation

The manifest is validated (`@vibestudio/shared/unitManifest`) at three points:

1. **Build**: no bundle is produced from a malformed manifest.
2. **Install**: no registry entry is recorded, and the user is not asked to
   approve.
3. **Boot**: a previously installed extension whose on-disk manifest has
   changed is not activated.

A failure throws `UnitManifestError` with a machine-readable `code` (for example
`MANIFEST_KIND` or `MANIFEST_ACTIVATION`). The error is stored in
`RegistryEntry.lastError`, and the extension stays in `error` until the manifest
is fixed.

## `activate(ctx)`

```ts
import type { ExtensionContext, Disposable } from "@vibestudio/extension";

export interface HelloApi {
  greet(name: string): Promise<string>;
}

export async function activate(ctx: ExtensionContext): Promise<HelloApi> {
  ctx.log.info("hello activating", { version: ctx.version });

  // Per-extension scratch — confined to {userData}/extensions/storage/<workspaceId>/<name>/
  await ctx.storage.mkdir("cache");

  // Subscriptions accumulated here are disposed in LIFO order on deactivate.
  ctx.subscriptions.push({
    dispose() {
      /* cleanup */
    },
  });

  return {
    async greet(name) {
      return `hello, ${name}`;
    },
  };
}

// Optional. Called on shutdown / reload. Subscriptions are auto-disposed; use
// this for explicit teardown (closing sockets, flushing buffers, etc).
export async function deactivate(): Promise<void> {}
```

### The API contract

`activate` returns a plain object. The host looks up the method on each call;
nothing is registered at activation time.

- A method is callable if
  `Object.hasOwn(api, method) && typeof api[method] === "function"`.
- Inherited prototype methods, `then`, `constructor`, `toJSON`, `inspect`, and
  non-function properties are skipped.
- Calling an unknown method returns `ENOMETHOD`.
- Arguments and return values follow the declared RPC wire schema. RPC carries
  `Uint8Array` and `ArrayBuffer` as bytes across JSON transports; no application
  envelope is needed. Streams need explicit handling (see the canaries for
  examples).

`activate` may return `void`. The extension then has no RPC methods and is
useful only for side effects, such as registering event handlers.

### `ctx.*` surface

The current surface mirrors what panels and workers see. It will narrow as
capabilities migrate.

| Client                     | Use                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ctx.name`, `ctx.version`  | Extension identity                                                                                       |
| `ctx.storage`              | Per-extension scratch directory (path-scoped to the storage root)                                        |
| `ctx.fs`                   | Filesystem of the invoking caller's context; within it, reads and writes are unrestricted                |
| `ctx.git`                  | Canonical typed external Git client (`gitInterop.*`)                                                     |
| `ctx.workspace`            | Workspace info (`getInfo`, etc.)                                                                         |
| `ctx.rpc`                  | `call(targetId, method, ...args)` for unified RPC targets                                                |
| `ctx.workers`              | Workspace service/DO discovery (`listServices`, `resolveService`, `resolveDurableObject`)                |
| `ctx.credentials`          | Stored credentials (OAuth tokens, secrets)                                                               |
| `ctx.webhooks`             | Webhook ingress (`webhookIngress` service)                                                               |
| `ctx.notifications`        | `show`/`dismiss` notifications in the shell                                                              |
| `ctx.extensions`           | Call other extensions (`use`, `invoke`, `on`) and manage them (`status`, `update`)                       |
| `ctx.invocation.current()` | The current `ExtensionInvocation` envelope, including the verified caller and chained `contextId`        |
| `ctx.invocation.signal()`  | `AbortSignal` for the current invocation; stop waiting and release caller-owned resources when it aborts |
| `ctx.subscriptions`        | Push `Disposable`s; auto-disposed LIFO on deactivate                                                     |
| `ctx.log`                  | Structured logger (`debug`/`info`/`warn`/`error`)                                                        |
| `ctx.health`               | Self-report operational health (`healthy`/`degraded`/`unhealthy`)                                        |
| `ctx.emit(event, payload)` | Fan-out to `extensions.on(name, event, cb)` subscribers                                                  |

### What's _not_ on `ctx.*`

- `ctx.panel`: panel orchestration is shell-only. Extensions cannot create or
  close panels in v1.
- `ctx.db`: there is no general-purpose database service. For shared DO-backed
  storage, declare a service in the manifest and reach it with
  `ctx.workers.resolveService(...)` and `ctx.rpc.call(targetId, descriptor, args)`
  using the provider's exported receiver contract. Use
  `ctx.storage` for scratch data. `resolveDurableObject(...)` accepts workspace
  worker classes only; host-internal DOs are not workspace targets and cannot be
  reached by guessing a class or object key.

If you need either, the answer is usually a separate extension called through
`ctx.extensions.use(...)`.

### Raw Node

```ts
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";

export async function activate() {
  // Raw Node writes follow the workspace's native resource admission.
  // They do not create per-call capability prompts or semantic VCS edits.
  await fs.writeFile("/tmp/extension-cache", "...");
  return {
    /* api */
  };
}
```

Raw Node calls run under the native execution rules: on Unix, MXC exposes the
workspace's selected filesystem resources plus normal network access; on
Windows, code runs with the application's OS-user permissions. Approval of the
source does not sandbox individual calls, and contexts do not isolate native
commands from other exposed resources in the same workspace.

`ctx.fs` is scoped to the context of the caller whose invocation is running
(`ctx.invocation.current()`); outside an invocation it is rejected. Within that
context, reads and writes are unrestricted: there are no per-call prompts.
Writes to workspace source paths are recorded as semantic edits of that
context's working state, never raw disk writes and never changes to protected
`main`; other paths are the context's scratch.

### Context folders: provision before reading from disk

A caller's context folder (`.context-projections/v6/{contextId}/`) is a complete
projection of one semantic working head. It is never a sparse checkout built
repo by repo: a repository is missing only if that state does not contain it.
Context ensure/fork and every semantic mutation write the full set of
repositories before returning.

If your extension reads the context folder **outside `ctx.fs`** (an `rg` or
`find` subprocess, `fs.createReadStream`, a recursive `fs.readdir`, and so on),
call `ctx.fs.ensureMaterialized` with the **narrowest scope** you will read. It
provisions the invoking caller's whole context folder regardless of scope (the
scope is used for capability checks and auditing) and returns that folder's
absolute on-disk root. Do not build the path yourself.

```ts
// Express what the extension intends to read; provisioning remains context-wide.
const root = await ctx.fs.ensureMaterialized("panels/chat"); // one repo
// Other scopes: "panels" (a section), ["packages/a", "packages/b"] (a set),
// "all" (ONLY for a true workspace-wide pass).
spawn("rg", [pattern, path.join(root, "panels/chat")]);
```

`ctx.fs.*` reads (`readFile`, `readdir`, `grep`, `glob`, ...) provision the
context folder themselves, so the explicit call is only needed for code that
reads the on-disk tree directly.

## Health

```ts
ctx.health.healthy();
ctx.health.degraded({
  summary: "FCM credentials expired",
  retryAt: Date.now() + 60_000,
});
ctx.health.unhealthy({
  summary: "native libvips missing",
  reasons: ["dlopen failed: ..."],
});
```

Health is **operational** state (is the extension doing its job). It is
separate from **lifecycle** status (is it running): a `running` extension can be
`degraded`. `runtime.supervision.describe({ kind: "extension", releaseId: name })`
reports lifecycle and artifact state; `health(row.identity)` reports
operational state.

`degraded` and `unhealthy` require a detail object with a `summary`; `reasons`
is optional. If you set `retryAt` (epoch ms), the UI shows a countdown.
`ctx.health.report(state, detail?)` is the general form.

An extension is `healthy` once `activate()` resolves. Call `healthy()` only to
recover from an earlier downgrade.

## Logs

```ts
ctx.log.info("processed", { count: 12, source: "github" });
ctx.log.warn("retrying", { attempt: 2 });
ctx.log.error("upstream failed", { code: "ETIMEDOUT" });
```

Records go to the workspace-wide unit log stream:

```ts
const logs = await runtime.supervision.logs(
  { kind: "extension", releaseId: "@workspace-extensions/hello" },
  { since: Date.now() - 60_000, level: "warn" },
);
```

`console.*` output is captured from stdout/stderr into the same stream with
`source: "stdout"` or `"stderr"`. Prefer `ctx.log`, whose structured fields are
searchable.

## Crash behavior

Each extension runs in its own forked Node process, so a crash affects only
that process. The manager respawns it with exponential backoff (`1s, 2s, 4s, 8s,
16s`). After five crashes within 60 seconds the extension is marked `error` and
stays down until `extensions.update(name)` starts it again.

If `activate(ctx)` throws, the extension is marked `error` immediately with no
respawn. Typical causes are a bad manifest, a missing dependency, or a failed
assertion during activation. Read `lastError` from `extensions.status(name)`,
then publish a fix.

## Templates

Four working scaffolds live in `docs/extensions/templates/`. Copy the one that
matches your dependencies:

| Template        | Use when                                                                |
| --------------- | ----------------------------------------------------------------------- |
| `minimal/`      | No external dependencies                                                |
| `plain-js-dep/` | Pure-JS npm dependency, safe to bundle                                  |
| `native-wasm/`  | Native or WASM dependency — let `dependencyMode: "auto"` externalize it |
| `external-cjs/` | CommonJS dependency that must load from `node_modules` at runtime       |
