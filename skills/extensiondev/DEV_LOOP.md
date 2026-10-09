# Dev loop

Extension source lives in the workspace-wide semantic VCS. Read
[vibestudio-vcs](../vibestudio-vcs/SKILL.md) before changing it. A running
extension changes only when a committed workspace event is published to
protected `main`; edits to the projected files or the build output do not
deploy anything.

## The flow

1. Make managed source edits against the working head from `vcs.status`.
2. Run the typecheck, tests, and the build report for the context. Fix every
   `file:line:col` diagnostic before publishing.
3. Publish with `vcs.publish({ message })`. It commits the complete local
   application chain and pushes it: push checks semantic ancestry and
   integration, reruns the build and typecheck on the candidate, asks for
   publication approval, and advances the protected refs atomically. If
   `main` has moved, it returns `IntegrationRequired` with the `compare` to
   review and changes nothing; merge in small local steps and publish again.
4. The advance of `main` starts a separate extension build and an
   extension-specific update approval.
5. The manager replaces the process and runs `activate(ctx)` only after the
   build succeeds and the update is approved. If the build, validation,
   approval, or activation fails, the previous extension keeps running.

If publication is refused (ancestry, integration, build/typecheck, approval,
or ref update), no protected ref moves. A failure after publication, during the
build or activation, does not undo the publication; fix it with a new semantic
event. There is no hot reload on save, no marker merge, and no force option.

## Dev-session approval

The source approval offers three choices:

- **Allow update** — accept this source update.
- **Reject update** — decline runtime activation and keep the old extension
  running; the source event remains published.
- **Allow extension updates to `<name>` without asking, for the next 4
  hours** — the dev-session grant. It is stored against the extension identity
  and checked before prompting again.

Use the dev-session grant while iterating. After 4 hours it expires and the next
source update prompts again.

This is the only place the extension trust model is relaxed for convenience.
Extension source updates are privileged, so review what you are pushing before
granting a session.

## Pushing from a panel or worker

Panels and workers use the same semantic VCS protocol as any other caller.
Follow the VCS skill and the live `help("vcs")` schema; there is no
extension-specific call sequence. The first protected publication may prompt;
later updates inside an approved dev session can be accepted automatically.

## Status, health, logs

`extensions.status(name)` joins the declared extension's build state (active
build, `availableUpdate` when it is stale, `pendingApproval`, `lastError`) with
its live process (`identity`, `health`, `methods`, crash `respawn`):

```ts
const status = await extensions.status("@workspace-extensions/hello");
```

For deeper supervision, address the live process by its release key, the
extension name:

```ts
const release = {
  kind: "extension",
  releaseId: "@workspace-extensions/hello",
} as const;
const [description] = await runtime.supervision.describe(release);
if (!description) throw new Error("Extension is not live");

const health = await runtime.supervision.health(description.identity, {
  limit: 100,
  errorLimit: 50,
});
const logs = await runtime.supervision.logs(release, { limit: 100 });
```

`description` holds lifecycle status, `lastError`, the artifact identity, and
supported facets. `health` holds the self-reported operational state plus
bounded logs and errors with dropped counts. Supervision only reports whether an
inspector facet exists; it does not give an inspector URL by extension name.

`ctx.log` records, extension stdout/stderr, worker/DO `console.*`, and panel
lifecycle diagnostics all go to one persisted diagnostic history under the
workspace state directory. Logs and errors have separate size limits, so noisy
info logs do not push out errors.

If the extension log shows only a symptom, check the workspace server host logs
for manager, reconcile, build, or routing failures: `services.serverLog.query(...)`
from eval, or the `about/server-logs` live viewer. See
`../server-logs/SKILL.md` for following host logs.

## Rebuild or restart without a source change

```ts
await extensions.update("@workspace-extensions/hello");
```

`update` rebuilds the extension from its published source and current
dependencies (a `@workspace/runtime` push, an npm version bump) and activates
the result. A changed build goes through the install/update approval; the call
settles with the new `extensions.status` once that approval and activation
finish, and fails with the original error if either does not. An up-to-date
extension is left as is.

To restart the _currently active approved build_ without rebuilding, for example
after changing state the extension reads in `activate()`, call
`runtime.supervision.restart(status.identity)`. It requires approval.

## Common failure shapes

| Symptom                             | Cause                                                                             | Fix                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MANIFEST_KIND`                     | An `extensions/*` manifest declares configuration for another location-owned kind | Keep `vibestudio.extension` configuration and remove foreign kind configuration |
| `MANIFEST_ACTIVATION`               | `activationEvents` is not exactly `["*"]` or `["onInvoke"]`                       | Choose eager workspace startup or start-on-first-invocation                     |
| Stays in `error` after update       | `activate()` threw                                                                | Read `lastError` from `extensions.status(name)` and retained logs               |
| `Cannot find module ...` at runtime | Dep was externalized but missing from runtime install                             | Set `dependencyMode: "external"` and confirm the package is in `dependencies`   |
| `Named export ... not found`        | ESM imported a named export from a CJS package                                    | Use `import pkg from "x"; const { fn } = pkg;`                                  |
| `require is not defined`            | Code crossed an ESM/CJS boundary in a bundled dep                                 | Switch the dep to `dependencyMode: "external"`                                  |
| 503 from `/_r/ext/<name>/*`         | Extension is `pending-approval`, `building`, or `error`                           | Approve the declaration/update or check `extensions.status(name)`               |
| 413 from fetch endpoint             | Request body exceeded 32 MB                                                       | Split the upload or stream to disk via `ctx.fs`                                 |

## Remove a Declaration

Remove the extension's entry from `meta/vibestudio.yml` through the semantic
adapter, commit the complete local application chain, and publish the workspace
event. The next reconcile stops the process and deletes its registry entry.
Per-extension scratch storage is kept. Delete the source separately if asked.
Approval grants stay keyed by `(principal, extension-name)`, so declaring the
same name again reuses them. Only declared extensions run.
