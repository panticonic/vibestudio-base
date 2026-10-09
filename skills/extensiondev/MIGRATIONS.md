# Migrating an in-host service to an extension

Migration candidates come from the host services in `src/server/services/*`;
`EXTENSIONS.md` (§ Migration candidates) lists them. Three completed migrations
(`imageService`, `typecheckService`, `browserDataService`) set the pattern.

## Decision: should this service migrate?

A service is a good extension candidate when:

- It is a self-contained capability, not core infrastructure like the
  dispatcher or approvals.
- Callers reach it through `ctx.<name>` or a worker/panel client, so the call
  sites are already in userland.
- It carries a substantial dependency (native addon, large in-memory state,
  optional network access).
- Its failure should not take down the server.

Stays in-host:

- Dispatcher, token manager, approval queue: extensions depend on them.
- The credential audit log: it is only useful if it cannot be turned off.
- Build pipeline: it builds extensions.
- Panel/worker lifecycle services: they manage other unit kinds.
- Credential storage core (`credentialService`): its trust is rooted in the
  host.

The definitive list is `EXTENSIONS.md` § "Must stay in-host".

## Pattern

Each migration follows the same steps:

1. **Create the extension** at `workspace/extensions/<service-name>/`.
   - Copy the service handler code into `activate(ctx)` and return the public
     methods.
   - Replace `ctx: ServiceContext` with `ctx: ExtensionContext`; get caller info
     from `ctx.invocation.current()`.
   - Move dependency wiring from the server bootstrap into top-level imports.

2. **Delete the in-host service**:
   - Remove `src/server/services/<service>.ts` and its test file.
   - Remove the registration in `src/server/index.ts` (or `panelRuntimeRegistration.ts`).
   - Remove any `ctx.<name>` exposure from `workspace/packages/runtime/`.

3. **Update the consumers.** Every `ctx.<name>.<method>(...)` (or
   `import { <name> } from "@workspace/runtime"`) becomes:

   ```ts
   import { extensions } from "@workspace/runtime";
   const svc = extensions.use<ApiType>("@workspace-extensions/<service>");
   await svc.<method>(...);
   ```

4. **Declare the extension** in the owning workspace's `meta/vibestudio.yml`
   under `extensions:`. Include it explicitly when publishing a workspace
   snapshot; copying selected source does not carry configuration or grants.
   The extension runs only after the normal unit review approves it.

5. **Add an integration test** at
   `tests/extension-<name>.integration.test.ts`. It boots a real server,
   approves the joint unit approval, calls a representative method, and checks
   that the response matches the old service's contract.

## What changes for callers

- **API shape** is unchanged. Updating a call site means replacing the import
  and the first segment of the call.
- **Authorization** moves from `policy.allowed` to `authority.provides` and
  per-method `extension.methodAuthority` in the manifest. The dispatcher checks
  them before extension code runs. Host effects still go through the host's
  protected receivers.
- **The first call** waits for install and approval. After that the extension
  stays running and calls cost one RPC.
- **Crashes are isolated.** The host respawns a crashed extension (1/2/4/8/16s
  backoff), where the in-host service would have taken the server down.

## What changes for the extension author

- **Dependencies** ship in the extension repo instead of the host, so they can
  be upgraded independently and the host's `node_modules` shrinks.
- **State** lives in `ctx.storage` (per-extension scratch), not in arbitrary
  host `{userData}` paths. `ctx.fs` exposes the admitted workspace filesystem
  and cannot reach old host paths. Moving existing host data needs an explicit,
  bounded host migration or a user-selected import; do not widen the native
  resource admission to reach an old path.
- **Logs and health** are structured: `ctx.log.info(..., { fields })` instead of
  `console.log`, and `ctx.health.report(...)` for operational state.

## Concrete examples

### `imageService` → `@workspace-extensions/image-service`

- Wraps `photon-node` for image dimensions and format detection. Stateless
  compute.
- The move was mechanical: the in-host service was a thin RPC wrapper around
  `photon`, and so is the extension.
- Call sites: every `ctx.image.dimensions(bytes)` became `extensions.use<ImageApi>("@workspace-extensions/image-service").dimensions(bytes)`.
- Dependency mode: `auto` (photon is WASM-backed; `auto` externalizes it).

### `typecheckService` → `@workspace-extensions/typecheck-service`

- A long-running TypeScript language service per panel that keeps substantial
  in-memory state across calls.
- Showed that an extension can be a long-running stateful service, not only
  stateless compute.
- The extension contains the TypeScript service helpers; only the generic
  npm-install helper is still shared.
- Path validation moved into the extension: per-method input validation
  replaces the old service-level `policy.allowed`.

### `browserDataService` → `@workspace-extensions/browser-data`

- Wraps a `BrowserDataDO` (a workerd Durable Object) for bookmarks/history/cookies.
- The extension provides the public API and any shell-only checks; the DO
  still stores the data.
- To wrap a DO in an extension, declare a workspace service, resolve it with
  `ctx.workers.resolveService(protocol, key)`, and call it with
  `ctx.rpc.call(targetId, method, ...args)`. Do not go through an internal
  target catalog: access and identity come from the manifest-declared service
  and its singleton/provider version. Host-internal DOs are not workspace
  targets, and exporting a workspace DO class does not expose arbitrary
  instances.

## Migration checklist

- [ ] Confirm the service is on the migration list (or you've justified adding it).
- [ ] Create `workspace/extensions/<name>/` with manifest + `index.ts`.
- [ ] Copy handler logic, adjust `ctx` references.
- [ ] Delete the in-host service and its registration.
- [ ] Update every consumer (`ctx.<name>` → `extensions.use<ApiType>(name)`).
- [ ] Add an integration test that boots a real server.
- [ ] Declare the extension in the template repository's `meta/vibestudio.yml` (`extensions:`).
- [ ] Confirm `build.listUnits()` reports the declared extension as available,
      then verify the row from
      `runtime.supervision.describe({ kind: "extension", releaseId: name })`
      has `lastError: null`.
- [ ] Document the public API type (`export interface <Name>Api`) so consumers can `extensions.use<NameApi>(...)`.
