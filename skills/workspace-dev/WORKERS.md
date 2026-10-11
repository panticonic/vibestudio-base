# Worker Runtime API

Every worker manifest declares one icon in `vibestudio.icon`: an emoji or a
safe unit-relative image path such as `"./assets/icon.svg"` (SVG, PNG, JPEG,
WebP, AVIF, GIF, or ICO, up to 1 MiB, copied into the immutable build). See
[the shared icon guide](references/icons.md). Catalog IDs go only to
scaffolding or `setUnitIcon`, which write the artwork; never store `lucide:` or
`brand:` IDs in a manifest. The icon identifies the worker in install and
approval prompts, so pick one for what the worker does, not how it is built.
Do not add a second icon under `vibestudio.agent`.

Credentials are URL-bound and can only be used through host-mediated egress.

Runtime clients have the same contracts in panels, workers, Durable Objects,
and eval, but each is bound to the runtime it runs in. Module-level exports from
`@workspace/runtime` bind to the initialized panel, plain worker, or eval
runtime, not to a Durable Object. In a Durable Object, use `this.rpc`, `this.fs`,
`this.credentials`, `this.notifications`, and `this.blobstore`, which carry the
object's identity and the current invocation's authority. For panel operations, use the instance methods on
`PanelDurableObjectBase`. Do not call `createWorkerRuntime` to initialize an
object or assign its clients to module globals. The build enforces this: a
package that declares `durable.classes` fails when its sources value-import
from `@workspace/runtime` or `@workspace/runtime/worker`. Import the base
classes and the `@rpc` decorator from `@workspace/runtime/worker/kernel` (or
`/worker/durable-base`, `/worker/panel-durable-base`), `createRpcFs` from
`/worker/rpc-fs`, and keep type-only imports as they are.

Filesystem calls have no implicit RPC deadline. They run until they settle or
the calling execution aborts them through an `AbortSignal`. Telemetry about
settled operations is observational and never aborts a call.

## Large documents and resumable imports

Chunked transfer does not limit stored size: appending each RPC chunk to one
SQLite text/blob cell, or storing a whole board with embedded attachments,
still produces an oversized cell. Keep independently edited entities in bounded
rows and binary attachments in the blob store
(`await this.blobstore.putBytes(bytes)` in a Durable Object). If the app does
store whole documents, hide segmentation behind one document read/write
abstraction: limit segments by UTF-8 bytes, record their order in a manifest,
and replace manifest and segments in one transaction. Callers never see segment
rows.

Give an import explicit receiving, completed, and cancelled states. Persist its
identity and accepted offset so an interrupted transfer can resume; reject gaps
and conflicting retransmissions. Validate the complete document, then publish it
atomically. A representation migration keeps existing document identities and
revisions. A receiving import stays open until explicitly completed or
discarded; elapsed time does not cancel it. Keep RPC-size limits separate from
stored-value limits, and verify with the real import size when asked.

## Worker Runtime Surface

<!-- BEGIN GENERATED: worker-runtime-surface -->
Generated from `runtimeSurface.worker.ts`. Use `await help()` at runtime for the live surface.

| Export | Kind | Members | Description |
|--------|------|---------|-------------|
| `formatRpcFailure` | value |  | Format an RPC failure, including nested causes and aggregate members, for a text-only display boundary. Use the structured error value for programmatic handling. |
| `PanelOperationError` | value |  | Structured error class thrown by panel create, navigation, reload, rebuild, and readiness operations. Inspect its failure provenance instead of parsing message text. |
| `id` | value |  |  |
| `contextId` | value |  |  |
| `rpc` | value |  | Portable RPC client. `rpc.call(targetId, methodDescriptor, args, options?)` requires an `RpcMethod` descriptor object; the method argument is never a method-name string. Import `mainRpcMethods` from `@vibestudio/service-schemas/mainRpc` for host methods, or the userland receiver's exported descriptor table. For a disposable receiver with no contract module, derive descriptors from its actual method names using `createReceiverRpcMethods` from `@vibestudio/shared/rpcMethods`. Pass the complete positional argument array, including `[]` for a zero-argument method. Calls, streams, and readable streams share this descriptor contract. |
| `fs` | value |  | Per-context filesystem sandbox. Paths are context-root-relative. The semantic workspace records managed mutations before projection; moves preserve file identity and copies mint a new identity with exact copy provenance. Tracked-to-scratch renames, managed empty-directory mkdir, and open with write flags are rejected. Scratch mkdir and utimes remain direct filesystem operations. Platform-excluded paths and paths outside reserved workspace source roots are local scratch. |
| `callMain` | value |  | Call a `main` (server) service method: callMain("fs.readFile", path). |
| `getParent` | value |  | Get the parent panel handle, or null when there is no parent. |
| `getParentWithContract` | value |  | Get the parent handle typed by a panel contract, or null. |
| `doTargetId` | value |  | Build a unified RPC target ID for a Durable Object reference. |
| `createDurableObjectServiceClient` | value |  | Resolve a Durable Object-backed service and call it through unified RPC. |
| `gatewayConfig` | value |  | Gateway base URL and bearer token for Vibestudio service routes. |
| `gatewayFetch` | value |  | Gateway-origin fetch helper. It accepts relative paths and absolute URLs on the configured gateway origin, then authenticates that request; cross-origin targets are rejected. Use credentials.fetch for external egress. |
| `openExternal` | callable |  | Call `await openExternal(url, options?)` from the initialized panel, plain-worker, or eval runtime to open the system browser. A Durable Object can call the same receiver through its public RPC client after importing `mainRpcMethods` from `@vibestudio/service-schemas/mainRpc`: `this.rpc.call("main", mainRpcMethods["externalOpen.openExternal"], [url, options])`. The call owns the approval prompt and resumes after the user decides. |
| `workers` | namespace | `listSources`, `create`, `createDurableObject`, `list`, `destroy`, `resetStorage`, `listStorageBackups`, `restoreStorageBackup`, `listServices`, `resolveService`, `resolveDurableObject`, `durableObjectService` | Worker discovery, lifecycle, and manifest-declared service resolution. Use create/list/destroy for regular worker instances; listSources() returns every launchable source with its real manifest entry point and Durable Object classes. |
| `workspaces` | namespace | `create`, `receipt` | Create workspaces from exact inspected template pins and reconcile durable receipts. Available to panels, workers, eval and connected websites under ordinary caller authorization. Creation returns no routing credentials or authority over the new workspace. |
| `credentials` | namespace | `openWebSocketScope`, `closeWebSocketScope`, `store`, `connect`, `beginWebsitePublication`, `recordWebsitePublication`, `configureClient`, `requestCredentialInput`, `getClientConfigStatus`, `deleteClientConfig`, `listStoredCredentials`, `summarizeStoredCredentials`, `inspectStoredCredentials`, `revokeCredential`, `resolveCredential`, `deriveCredential`, `fetch`, `publishFetch`, `hookForUrl`, `gitHttp`, `forAudience` | Typed credential lifecycle and credentialed network access. Use resolveCredential({ url }) for host-owned audience matching; an unbound URL returns null without UI. Inventory summaries do not replace the resolver's binding and use policy. Use openWebSocketScope({ url, credentialId }) to own one credentialed WebSocket request under the authenticated originating invocation; opening does not authorize credential use. Use store(input) to persist a URL-bound credential, fetch(url, init?, { credentialId? }?) for credentialed HTTP and a standard Response, hookForUrl(url, { credentialId? }?) for a bound fetch function, gitHttp({ credentialId?, gitIntent? }) for smart-HTTP, and forAudience(descriptor) for a credential-bound handle. The underlying RPC transport is internal. |
| `browserData` | namespace | `getBrowserEnvironment`, `listImportHosts`, `listImportAcquisitionOptions`, `beginImportAcquisition`, `releaseImportSource`, `listImportSources`, `previewImport`, `previewSensitiveImport`, `startImport`, `startSensitiveImport`, `observeSensitiveImport`, `cancelSensitiveImport`, `openBrowserPrivacyManager`, `cancelImport`, `getImportJob`, `observeImportJob`, `listImportJobs`, `listOpenTabs`, `openTabsAsPanels`, `getSitePreferences`, `setSiteZoom`, `getBookmarks`, `addBookmark`, `updateBookmark`, `deleteBookmark`, `moveBookmark`, `searchBookmarks`, `getHistory`, `deleteHistoryEntry`, `deleteHistoryRange`, `clearAllHistory`, `searchHistory`, `searchHistoryForAutocomplete`, `recordHistoryVisit`, `updateHistoryTitle`, `getSearchEngines`, `setDefaultEngine`, `saveSearchEngine`, `getSearchSuggestions`, `listDownloads`, `listDownloadRecords`, `upsertDownloadRecord`, `pauseDownload`, `resumeDownload`, `cancelDownload`, `openDownload`, `revealDownload`, `putPageFavicon`, `getPageFavicon`, `exportBookmarks` | Typed access to the manifest-declared browser-data provider: detection, import, secret-free summaries, approved sensitive reads, mutation, and export. |
| `git` | namespace | `setSharedRemote`, `removeSharedRemote`, `setUpstream`, `removeUpstream`, `detachUpstream`, `setAutoPush`, `upstreamStatus`, `createBranch`, `pushUpstream`, `pullUpstream`, `publishRepo`, `commitMapping`, `importProject` | Typed external Git operations routed through the workspace's configured gitInterop provider. Import and pull create unpublished semantic candidates; only ordinary VCS integration and explicit publication advance protected main. Declarations carry logical credential names resolved by the host, while credential-free remotes are anonymous-first. Pull dry-runs use isolated temporary state and do not mutate managed Git, semantic state, or the remote. |
| `vcs` | namespace | `edit`, `move`, `copy`, `merge`, `revert`, `commit`, `discard`, `importSnapshot`, `registerExternalDelta`, `supersedeExternalDelta`, `finalizeExternalDelta`, `push`, `mainState`, `status`, `compare`, `inspect`, `neighbors`, `history`, `walk`, `query`, `search`, `blame`, `readMemory`, `resolveRepository`, `readFile`, `readFiles`, `listDirectory`, `listFiles`, `publish` | Simple semantic version control: exact event/application state, expressive edit/move/copy records, incremental local integration, whole-chain commit/discard, directly walkable provenance, and atomic external-snapshot acknowledgements containing the committed event/application/work-unit/repository/snapshot tuple. |
| `gad` | namespace | `status`, `ensureBlob`, `listUserNotificationsForMe`, `acknowledgeUserNotification`, `putUserNotification`, `deleteUserNotification`, `getTrajectoryBranchHead`, `listTrajectoryBranches`, `listTrajectoryInvocations`, `listTrajectoryApprovals`, `listChannelEnvelopes`, `listTrajectoryEvents`, `appendChannelEnvelope`, `listMessageTypes`, `getMessageType`, `getChannelEnvelope`, `getTrajectoryForEnvelope`, `resolveTrajectoryForkPoint`, `listPublishedEnvelopesForTrajectory`, `getEnvelopesForTrajectory`, `getPublishedArtifactsForTurn`, `getPrivateLineageForPublishedEnvelope`, `getDownstreamConsumers`, `readChannelEnvelopes`, `inspectChannelEnvelopes`, `listStoredValueRefs`, `inspectStorageDiagnostics`, `inspectPublicationIntegrity`, `inspectTurnState`, `inspectInvocationState`, `diagnoseInvocation`, `inspectChannelRoster`, `inspectAgentHealth`, `inspectAgent`, `listAgentDirectory`, `searchAgentDirectory`, `describeChannels`, `validateGadHashes`, `clearDirtyAfterValidation`, `checkGadIntegrity`, `rebuildTrajectoryProjections`, `collectChannelEnvelopePages` | Typed access to the workspace's canonical Graph and Data store: parameterized SQL, trajectory/channel lineage, integrity diagnostics, provenance, and bounded channel-envelope paging. |
| `images` | namespace | `generate`, `getJob`, `cancel`, `retry`, `forgetJob`, `deleteArtDirection`, `getAsset`, `readAsset`, `importAsset`, `retain`, `release`, `putArtDirection`, `getArtDirection`, `getBytes`, `wait` | Workspace image assets and durable generation jobs. generate({requestId,prompt,references?,artDirection?}) returns a job; wait(job.id) observes completion. Store the resulting immutable asset reference in application state. GeneratedImage from @workspace/react displays assets in running panels without rebuilding. getBytes performs authenticated reads for custom renderers. retain/release manage application ownership; art direction versions provide reusable style briefs and reference assets. |
| `missions` | namespace | `overview`, `list`, `get`, `getDefault`, `listRuns`, `getRun`, `launch`, `provisionDefault`, `edit`, `runNow`, `cancel`, `pause`, `resume`, `retire` | Durable automations (vibestudio.missions.v1). launch({name, charter}) and edit(missionId, {name?, charter?}) compile the charter's authority plan as the calling author, then call the missions controller, which verifies that plan; never compile by hand. edit recompiles only when the execution changes or a seeded default is customized. overview/list/get/listRuns/getRun read the ledger; runNow/cancel/pause/resume/retire control one automation. Agents launching work for themselves use the launch_automation tool instead. |
| `blobstore` | namespace | `has`, `stat`, `putText`, `getText`, `getRange`, `getRangeBytes`, `grep`, `putBase64`, `putRetained`, `retain`, `releaseRetention`, `getBase64`, `putTree`, `getTree`, `listTree`, `readFileAtTree`, `diffTrees`, `materializeTree`, `delete`, `list`, `putBytes`, `getBytes`, `readText`, `putPathTree` | Per-workspace content-addressable blob store: putText/putBase64 store, getText/readText/getRange/getRangeBytes/getBase64 fetch, grep searches; returns a sha256 digest. readText is a portable alias of getText and both return string \| null. Runtime-only putBytes(Uint8Array \| ArrayBuffer) and getBytes(digest) losslessly bridge the wire's base64 representation; MIME metadata is not stored. Persist large artifacts/screenshots and return the digest. Immutable file trees: putPathTree({ "a/b.txt": text \| bytes \| { digest } }, opts?) stores a nested tree in one call; putTree/getTree store and read single tree objects, listTree/readFileAtTree walk a tree hash, diffTrees compares two trees. |
| `webhooks` | namespace | `createSubscription`, `listSubscriptions`, `revokeSubscription`, `rotateSecret` | Ergonomic owner-scoped webhook lifecycle, identical in panels, workers, DOs, and agent eval: createSubscription(request), listSubscriptions(), rotateSecret(subscriptionId, secret?), and revokeSubscription(subscriptionId). Each subscription has an explicit maxBodyBytes budget: relay defaults to its 1,500,000-byte transport ceiling, while direct defaults to the operator-configured host ceiling (16 MiB by default). Delivery events currently include rawBodyBase64, so the host ceiling also bounds that in-memory expansion. Agent eval delegates ownership and target-source checks to its host-verified owning runtime. Secrets are redacted from listings. |
| `extensions` | namespace | `use`, `invoke`, `invokeProvider`, `on`, `status`, `update` |  |
| `templates` | namespace | `inspect`, `inspectAuthoring`, `authoringParts`, `publishAuthoring` | Exact source inspection and publication through the admitted template receiver. |
| `notifications` | namespace | `show`, `dismiss` |  |
| `problemReports` | namespace | `usageTransport`, `availability`, `incidents`, `transport`, `importPrepared`, `forConversation`, `collect`, `serverConsent`, `decideServer`, `consent`, `decide`, `create`, `get`, `update`, `appendNarrative`, `patchNarrative`, `prepare`, `send`, `history`, `cancel`, `resume`, `retainExport`, `remoteStatus`, `deleteRemote`, `deleteLocal` | Local problem reports owned by the calling user. create a manual draft, appendNarrative/patchNarrative with host-assigned section IDs and caller-derived authorship, prepare to freeze sanitized bytes (returns { revision, submissionId, digest, bytes }), and send(reportId, revision, digest) to request upload; agent callers wait for a one-time human approval of that exact report. Consent and other trusted-human controls reject agent callers. |
| `services` | value |  | Portable raw service namespace: services.<svc>.<method>(...) is always the server service <svc>, dispatched through the caller-scoped main service boundary, even when a runtime binding shares the name (services.blobstore is the raw blobstore service, the blobstore binding is the curated client). The client contract is shared by panels, workers, Durable Objects, and eval; Durable Objects bind clients to their own instance RPC. |
| `hosts` | value |  | Portable owner-scoped attached-host access for development sessions. |
| `runtime` | namespace | `createEntity`, `reserveEntity`, `activateReservedEntity`, `faultAbortAgentVessel`, `retireEntity`, `releaseResourceBindings`, `replaceResourceBindings`, `recoverExecution`, `listEntities`, `resolveContext`, `listContexts`, `setTitle`, `createContext`, `cloneContext`, `rebindAgentChannel`, `destroyContext`, `forkSemanticContext`, `dropSemanticContext`, `listOwnedContexts`, `recordContextEdge`, `createSubagentContext`, `supervision.list`, `supervision.describe`, `supervision.health`, `supervision.logs`, `supervision.reportReady`, `supervision.reportHealth`, `supervision.appendLog`, `supervision.restart`, `supervision.activate`, `supervision.prepare`, `supervision.retire`, `supervision.versions`, `supervision.rollback` | Portable typed runtime lifecycle and supervision client for the current workspace context. |
| `workspace` | namespace | `getInfo`, `getActive`, `getConfig`, `validateConfig`, `setInitPanels`, `setConfigField`, `applyPreparedConfig`, `getAgentResources`, `getAgentsMd`, `listSkills`, `readSkill`, `sourceTree`, `ensureContextFolder`, `findUnitForPath`, `projects` | Workspace catalog, source tree, and unit helpers. Does not include panelTree; use runtime.panelTree for panel-tree handles. |
| `createPanelSlot` | value |  | Commit a panel and promptly return its durable handle without focusing or waiting for activation, build, or boot. Server reconciliation owns activation after commit and recovers it across transient failure or restart. Pass operationId for retry-stable identity; use handle.observe() when current lifecycle state matters. |
| `openPanel` | value |  | Create a panel and return its handle after the exact attempt is application boot-ready, with no fixed readiness deadline. Pass options.signal for caller-owned cancellation and operationId for retry-stable identity. It defaults under the caller and focused; use parentId:null for a root or focus:false to suppress presentation. options.placement accepts "side" (default), "side-if-room", "replace", or "split-below". The returned PanelHandle is the complete lifecycle and inspection API. Use `const session = await handle.cdp.session(); const page = session.page` for automation. Keep the stable page across rebuild/navigation; its next awaited operation rebinds without replaying the interrupted action. `session.receipt` reports acquired, reconnected, or replaced generations. For a one-call host image use `await handle.cdp.screenshot({ format: "png" })`. For host-captured logs since panel creation use `await handle.cdp.consoleHistory()` (live page console events are separate). |
| `getPanelHandle` | value |  | Alias for runtime.panelTree.get(id, kind?). |
| `panelTree` | namespace | `self`, `get`, `rootOwners`, `roots`, `rootsForOwner`, `children`, `page`, `walk`, `path`, `search`, `parent`, `navigate`, `navigateHistory` | Runtime property, not workspace.panelTree. self/get are synchronous handle factories. Use roots(input?) for the current human subject, rootOwners() then rootsForOwner(ownerUserId) for cross-owner inspection, or children(parentSlotId); each returns a bounded page with entries. walk(rootSlotId, { limit }) async-iterates a bounded subtree breadth-first. page(...) is the advanced discriminated-group primitive. search(...) returns hits containing entry.node and entry.handle. Handle navigate/navigateHistory/focus/reload/rebuild return a boot-ready PanelObservation; observe is the sole live status read. |
| `handleRpcPost` | value |  |  |
| `destroy` | value |  |  |
<!-- END GENERATED: worker-runtime-surface -->

Readiness-bearing panel operations also request materialization. After an
eviction, the portable runtime reuses the idempotent host-lease transition;
`observe()` stays read-only. Programmatic workers prefer a headless CDP host,
while a native desktop focus bridge keeps the UI on the desktop. Reconnect grace
does not preserve readiness, and mobile-held or failed hosts reject immediately
with structured host failures.

The worker does not own existing panel handles: do not call `handle.navigate`,
`handle.reload`, or `handle.archive` unless asked. Use
`handle.navigate(source, opts)` or `panelTree.navigate(id, source, opts)` only
when the task is to replace that slot. In navigation options, `contextId`
selects the filesystem/storage context, and the code builds from that same
context (`ctx:<contextId>`) unless `ref` names other code. Clean up temporary
panels the worker opened.

A context is a branch of the whole workspace, across every repository; the
selected repository or vault is state inside it. Panels, their channels, and
agents launched from them share the panel's host-bound context, so do not put a
second context in `stateArgs`. Only the fork/clone/subagent lifecycle APIs
create branches. A panel moves to an existing branch only through
`panel.switchContext(contextId, opts?)` or a panel-tree navigation carrying
`contextId`.

For all code-backed runtimes, `contextId` selects filesystem/storage isolation.
On direct creation (`workers.create`, `runtime.createEntity`), an omitted `ref`
selects the verified initiating caller's semantic workspace, even when
`contextId` names another context; a caller without a context gets protected
main. Pass `ref: "ctx:<contextId>"` to build from a different context, or
`ref: "main"` to use protected main deliberately. Clones build from the cloned
semantic frontier. Reserved activation, which is how panels open, navigate, and
rebuild, builds from the reserved runtime's own context
(`ctx:<its contextId>`) unless an explicit `ref` is given.

## Worker Lifecycle and Environment Bindings

### Durable Object creation configuration

Dynamic Durable Objects receive their creation configuration through
`this.ctx.props.stateArgs`, a parsed object or `null`. This configuration belongs
to the object, while `env` belongs to its shared executable. Keep instance state
on the Durable Object instance or in its owned storage; module globals may be
shared by several objects running the same code image. Agent behavior settings
are seeded from `this.ctx.props.stateArgs?.agentConfig`, and child identity from
`this.ctx.props.stateArgs?.subagent`. The exact installed source receipt lives in
`this.ctx.props.image` (`effectiveVersion` and `sourceRef`); use it when launching
an automation from the executing agent rather than reading object facts from
shared environment bindings.

When `workers.createDurableObject(...)` creates an owned instance, call it
through the returned handle's `targetId` and destroy it through its `id` or
the handle. The handle does not include the creation key. If you will need a
later `workers.resolveDurableObject(source, className, objectKey)` lookup, pass
an explicit `key` at creation and retain that exact value.

### Startup and dependency budgets

Worker and Durable Object builds keep ESM dynamic imports as separate modules in
the sealed workerd module map. Use this deliberately:

- Limit the entry module, exported DO classes, constructors, migrations, and
  subscription/bootstrap path to code every activation needs.
- Dynamically import feature code where it is used: model provider adapters at
  model selection or call, HTML/PDF extraction at fetch, syntax parsers at code
  evaluation, exporters at telemetry export, and admin/debugging code at
  inspection.
- Prefer narrow package subpath exports over a broad barrel. A barrel that
  re-exports tools or providers can pull their whole static import graph into
  every worker even when only one type or helper is used. Use `import type` for
  type-only imports.
- Do not write a second, reduced implementation. Split the package into a
  side-effect-free kernel and feature modules. Each feature keeps its normal
  validation, authority checks, error handling, and tests when loaded.
- Verify both ends: assert that a marker from the heavy code is absent from
  `bundle.js` and present in a chunk, then run the dynamic import in a real
  workerd test. If esbuild emits a chunk but the immutable artifact store or
  loader drops it, that is a runtime defect.

Build reports and source maps measure different costs: entry/static-graph bytes
approximate cold parse and evaluation, lazy bytes show deferred features, and
total sealed bytes show storage and module-map transfer. Code splitting does not
reduce all three. Pair these numbers with one cold and one verified-cache
activation trace, as described in `skills/performance/SKILL.md` in the System
workspace.

List launchable sources with `await workers.listSources()`. The result covers
every regular and Durable Object worker, with its workspace `source`, the
manifest's actual `entry`, and `classes` (empty for a regular worker). Use the
returned `entry` or read `<source>/package.json`; do not assume `index.ts`.

Launch and retire a regular worker with the portable typed client, which
delegates to the runtime entity service:

```ts
const handle = await workers.create("workers/my-worker", {
  key: `probe-${crypto.randomUUID()}`,
  contextId: ctx.contextId,
  env: { NON_SECRET_PROBE: "configured" },
});

try {
  // Exercise the worker here.
} finally {
  await workers.destroy(handle);
}
```

`key` is a permanent instance identity, not a deployment slot: the same key
always addresses the same build and never picks up code from a later edit. For
throwaway edit-and-run work, use a fresh key after every code change. If an
application deliberately uses a stable key, retire the old handle before
creating the replacement. Either way, keep the handle in scope and await
`workers.destroy(handle)` in `finally`. An identity-collision error means an
older instance still holds the key; do not work around the identity check.

Extra `env` values are string bindings passed as the second argument of the
worker's `fetch(request, env, ctx)` handler. Read them from `env` (typed as
`WorkerEnv`), not from Node's `process.env`.

A resolved `runtime.createEntity` means the host accepted the env and started
the worker, not that the worker saw the value. To check end to end, expose one deliberately non-secret probe from
the worker under test and call it through the returned `targetId`:

```ts
import {
  createWorkerRuntime,
  handleWorkerRpc,
  type ExecutionContext,
  type WorkerEnv,
} from "@workspace/runtime/worker";

let exposedForWorker: string | null = null;
let probeReceiver: ProbeReceiver | undefined;

export class ProbeReceiver {
  constructor(private readonly value: string | null) {}

  observeConfiguredValue() {
    return { value: this.value };
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext) {
    const runtime = createWorkerRuntime(env);
    probeReceiver = new ProbeReceiver(
      typeof env["NON_SECRET_PROBE"] === "string"
        ? env["NON_SECRET_PROBE"]
        : null,
    );
    if (exposedForWorker !== env.WORKER_ID) {
      runtime.rpc.expose("observeConfiguredValue", () =>
        probeReceiver!.observeConfiguredValue(),
      );
      exposedForWorker = env.WORKER_ID;
    }
    const rpcResponse = handleWorkerRpc(runtime, request);
    if (rpcResponse) return rpcResponse;
    return new Response("ready");
  },
};
```

```ts
import { probeRpcMethods } from "@workspace-workers/probe/contract";

const observed = await rpc.call(
  handle.targetId,
  probeRpcMethods.observeConfiguredValue,
  [],
);
if (observed.value !== "configured") throw new Error("Worker env mismatch");
```

The worker exports that descriptor table from `contract.ts`, derived from its
actual receiver:

```ts
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { ProbeReceiver } from "./index.js";

export const probeRpcMethods = createReceiverRpcMethods<
  Pick<ProbeReceiver, "observeConfiguredValue">
>(["observeConfiguredValue"]);
```

Keep the probe narrow and remove it from production code. Never expose the
whole `env` object or accept an arbitrary key: env may contain bearer tokens and
other secrets. Do not add env fields to `runtime.listEntities` or entity
handles.

## Userland Services

Read [`skills/capabilities/SKILL.md`](../capabilities/SKILL.md) before exposing
or consuming a service. Service declarations are read at runtime from the
calling context's live semantic `meta/vibestudio.yml`, which also feeds the live
service/API docs; they are not compiled into a static list. A service declared
in another context is neither visible nor callable.

A worker's package.json only carries `vibestudio.durable.classes` (the workerd
binding). Workspace-level singletons, services, and HTTP routes live in
`meta/vibestudio.yml`. Resolve services by name or protocol through
`workers.resolveService(...)`; do not hardcode `workers/foo`, DO class names, or
`/_r/w/...` paths in callers.

If you do not know a service's live contract, look it up with the agent tools
`docs_search`/`docs_open` before starting an eval. They are not
`@workspace/runtime` exports; inside eval, use the documented `workers.*` and
`rpc.*` APIs. `workers.listServices()` rows for workspace-owned services include
a `docsId`; pass it to `docs_open` instead of reading the provider source.

The receiver method and the target route are authorized separately:

- An unprotected receiver method declares `effect: { kind: "open" }`.
- A protected method owned by the provider declares a static
  `effect: { kind: "userland-capability", ... }` matching its package's
  `authority.provides`.
- Resolving a service from `meta/vibestudio.yml` adds its own target
  requirement, `workspace-service:<name>`, taken from that live declaration.
- A context-local DO whose lifecycle the caller owns, addressed through
  `workers.resolveDurableObject(source, className, objectKey)`, has no service
  target requirement; its method effect and lifecycle/context ownership still
  apply.

Prefer the declared-service route for application APIs. Use direct resolution
only for objects whose lifecycle the caller explicitly owns, such as a
throwaway development probe, and retire or clear them when finished.

Installed code that consumes the service declares a `workspace-service:<name>`
request in its authority manifest. The request may exist before the provider
does in this checkout; the build does not derive authority from the services it
finds. At runtime, resolution still needs a matching live declaration, the provider's effective version, visibility
from the caller's context, and a grant. Never use `workspace-service:*` in an
installed unit's request, and never add the service to a generated host
authority catalog.

Declare worker registry dependencies and Build V2 override or patch policy as
described in [external dependency resolution](DEPENDENCIES.md). Never use
top-level package-manager resolution fields in a worker package.

**Singleton Durable Object-backed service:** author the service export in the
provider unit's `package.json`, then select it and declare its fixed object key
in `workspace/meta/vibestudio.yml`. The root manifest contains only the
provider path and exported name:

```yaml
singletonObjects:
  - source: workers/my-store
    className: MyStore
    key: main

services:
  - source: workers/my-store
    name: my-store
```

Add the service details to `workers/my-store/package.json` under
`vibestudio.services` (alongside the unit's other `vibestudio` fields):

```json
{
  "vibestudio": {
    "services": [
      {
        "name": "my-store",
        "title": "My store",
        "action": "read or update stored items",
        "description": "Keep shared application data in this workspace.",
        "notability": "everyday",
        "presentation": { "domain": "automation", "verb": "manage" },
        "protocols": ["example.my-store.v1"],
        "authority": { "principals": ["user", "code"] },
        "durableObject": { "className": "MyStore" }
      }
    ]
  }
}
```

Resolve and call it:

```ts
import { rpc, workers } from "@workspace/runtime";
import { myStoreRpcMethods } from "@workspace-workers/my-store/contract";

const svc = await workers.resolveService("example.my-store.v1");
if (svc.kind !== "durable-object") throw new Error("Expected DO service");
await rpc.call(svc.targetId, myStoreRpcMethods.addItem, ["Review inbox"]);
```

Export a descriptor table beside the receiver and import it at each caller.
Derive it from the actual receiver, for example
`createReceiverRpcMethods<Pick<TodoStore, "upsertTodo" | "listTodos">>(["upsertTodo", "listTodos"])`.
Import `createReceiverRpcMethods` from `@vibestudio/shared/rpcMethods`. Public
RPC calls require a descriptor; callers cannot choose their own result type.
Keep descriptor modules free of receiver runtime imports by using `import type`.

The consuming unit must declare the service route in its own `package.json`.
Add it together with the call; do not wait for the build to report it:

```json
{
  "vibestudio": {
    "authority": {
      "requests": [
        {
          "capability": "workspace-service:my-store",
          "resource": { "kind": "prefix", "prefix": "" },
          "tier": "gated",
          "evidence": "intentional-broad"
        }
      ],
      "serviceRequests": [
        { "protocol": "example.my-store.v1", "availability": "required" }
      ],
      "provides": []
    }
  }
}
```

If a provider method also declares a protected provider-owned capability,
request that capability separately, using the name reported by the live docs.
Do not add a fake dependency package or a wildcard to silence the verifier.

**Stateless worker service:** select the provider route in `meta/vibestudio.yml`:

```yaml
routes:
  - source: workers/my-api
    path: /api
    worker: true

services:
  - source: workers/my-api
    name: my-api
```

Export its service contract from `workers/my-api/package.json` under
`vibestudio.services`:

```json
{
  "vibestudio": {
    "services": [
      {
        "name": "my-api",
        "title": "My API",
        "action": "use the workspace API",
        "description": "Run workspace-local API operations.",
        "notability": "everyday",
        "presentation": { "domain": "automation", "verb": "act" },
        "protocols": ["example.my-api.v1"],
        "authority": { "principals": ["user", "code"] },
        "worker": { "routePath": "/api" }
      }
    ]
  }
}
```

Resolve and fetch it:

```ts
const svc = await workers.resolveService("example.my-api.v1");
if (svc.kind !== "worker") throw new Error("Expected worker service");
await gatewayFetch(`${svc.routeBasePath}/jobs`, {
  method: "POST",
  body: JSON.stringify(payload),
});
```

Rules for routes and object keys:

- A `routes[].durableObject` declaration needs a matching `singletonObjects`
  row, because an HTTP route has no object-key input.
- A `services[].durableObject` declaration without a matching row is a factory;
  callers must pass an explicit `objectKey` to `workers.resolveService`.
- A stateless service route is live only while the published worker instance
  is running. Its service declaration must reference a worker-backed route with
  the same source and path. Each route declares either `worker: true` or
  `durableObject`, never both.
- HTTP service resolution addresses the published worker, not a private build in
  a task context. A task context may declare an alias for an existing published
  route, but declaring a new HTTP route there does not create a private HTTP
  receiver. To write and consume a context-local service without publishing,
  use a Durable Object service.

## Durable Object-backed App Databases

Use a Durable Object as the default database for user-facing workspace apps,
panels, and long-lived agent workflows whenever data must be shared beyond one
agent's eval. The eval `db` is private to that agent's EvalDO. It suits scratch
analysis and resumable diagnostics, but panels, apps, workers, and other agents
cannot use it.

To build a new panel with a DO store, write the explicit policy described in
[PROJECTS.md](PROJECTS.md), then call `prepareApplication`. It prepares one
connected candidate in the context, rather than two unconnected units, and does
not publish anything:

```ts
eval({
  code: `
  import { prepareApplication } from "@workspace-skills/workspace-dev";
  scope.prepared = await prepareApplication({ name: "todo-app", title: "Todo App", authority: scope.authorityPolicy });
  return scope.prepared;
`,
});
```

The connected scaffold generates the code, service, and singleton from the
policy you supply. It never adds missing consumer requests or chooses method
contracts. Review, verify, and publish the candidate separately; preparation
changes neither main nor the live runtime. Use `workspace_service` for later
declaration changes. Custom or existing units follow the same steps:

1. Create `workers/<store>` with a `DurableObjectBase` subclass. For a new
   connected app, `prepareApplication` creates this and its paired panel;
   `prepareProjects` creates independent units without service wiring.
2. Store rows in the DO's SQLite database through `this.sql`. The cursor
   provides `toArray()`, `one()`, and native `columnNames`, `rowsRead`, and
   `rowsWritten` counters. Consume a query before reading its final counters.
   These are workerd cursor counters, not a portable `changes()` shortcut or a
   count of application entities. See the [native SQLite cursor contract](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
3. Expose narrow app methods with explicit
   `@rpc({ website, principals, effect: { kind: "open" }, tier, sensitivity })`
   contracts. The build reads each policy without running provider code, so
   every field is written inline or names a module-level `const` in the same
   file (`as const` is fine), and a policy may spread such a constant, e.g.
   `const READ = { website: privateSite, effect: { kind: "open" }, tier: "open" } as const`
   then `@rpc({ ...READ, principals: ["user", "code"], sensitivity: "read" })`.
   Imports, `let` bindings, and computed values are build errors. Do not expose
   a raw SQL console to normal UI callers.
4. Use `workspace_service` to declare the service and its matching singleton in
   one change, listing the principal families that may resolve it. Skip this for
   the service `prepareApplication` already created.
5. Call it from eval, panels, inline UI, apps, workers, or other DOs with
   `workers.resolveService(protocol, objectKey?)` and `rpc.call(...)`.

Minimal store:

```ts
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";

type TodoRow = {
  id: string;
  title: string;
  done: number;
  updated_at: string;
};

export class TodoStore extends DurableObjectBase {
  static override schemaVersion = 1;

  protected override createTables(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);
  }

  protected override requiredTables(): readonly string[] {
    return ["todos"];
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Todo data is private to the installed app.",
    },
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  upsertTodo(input: { id?: string; title: string; done?: boolean }): {
    id: string;
  } {
    this.ensureReady();
    const id = input.id ?? crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO todos (id, title, done, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         done = excluded.done,
         updated_at = excluded.updated_at`,
      id,
      input.title,
      input.done ? 1 : 0,
      new Date().toISOString(),
    );
    return { id };
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Todo data is private to the installed app.",
    },
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listTodos(): Array<{
    id: string;
    title: string;
    done: boolean;
    updatedAt: string;
  }> {
    this.ensureReady();
    return this.sql
      .exec<TodoRow>(`SELECT * FROM todos ORDER BY updated_at DESC`)
      .toArray()
      .map((row) => ({
        id: row.id,
        title: row.title,
        done: row.done === 1,
        updatedAt: row.updated_at,
      }));
  }
}
```

Export the public receiver contract from `workers/todo-store/contract.ts`:

```ts
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { TodoStore } from "./index.js";

export const todoStoreRpcMethods = createReceiverRpcMethods<
  Pick<TodoStore, "upsertTodo" | "listTodos">
>(["upsertTodo", "listTodos"]);
```

Export `./contract` from the worker package and declare
`@vibestudio/shared` as a dependency. Callers import this table; they don't
restate method signatures or choose result types. Dynamic main-process method
names use the validating `mainRpcMethod(name)` lookup and return `unknown`.

Declare application-defined protocols in `meta/vibestudio.yml`; do not add
`vibestudio.durable.classes[].rpcSchema` for them. `rpcSchema` selects one of a
small set of reviewed schemas built into the host, and an arbitrary application
protocol name fails the build as unknown. The `durable-service` scaffold
therefore declares only `{ className }`.

### Keep the activation kernel small

`DurableObjectBase` is the storage, RPC, and lifecycle kernel. Import it from
`@workspace/runtime/worker/kernel` for regular services. When another shared
package offers narrow worker entry points, import those: a package barrel can
keep every exported feature in the eagerly loaded worker graph even when your
code names only one export.

Use `PanelDurableObjectBase` from
`@workspace/runtime/worker/panel-durable-base` only when the DO itself calls the
protected panel-tree helpers (`createPanelSlot`, `openPanel`,
`getPanelHandle`, or `panelTree`). Those live outside the base kernel so that
non-panel workers do not parse and initialize panel-runtime code on activation.

Keep expensive feature families behind literal dynamic imports. A worker can
offer packages to eval without putting them in its activation bundle: the
generated runtime preloads the required chunk before running eval code that
uses it synchronously. Do not add a synchronous registry or a root-barrel import
to make lazy code more convenient; that quietly pulls parsers, schema
libraries, and runtime catalogs back into every activation.

Choose the service's object identity deliberately. A `singletonObjects` row
gives it one fixed default object key (`main` below); use that for a single
workspace-wide coordinator. Omit the row to make a factory service, and have
every caller pass the right per-project, per-account, or per-document
`objectKey`.

```yaml
singletonObjects:
  - source: workers/todo-store
    className: TodoStore
    key: main

services:
  - source: workers/todo-store
    name: todo-store
```

The details (`title`, `action`, `presentation`, `protocols`, `authority`, and
`durableObject`) are exported from `workers/todo-store/package.json` under
`vibestudio.services`, as shown above. The root service list selects that
provider export; it does not duplicate its details.

Call it from eval, a panel, an inline UI component, an app, a worker, or
another DO:

```ts
import { rpc, workers } from "@workspace/runtime";
import { todoStoreRpcMethods } from "@workspace-workers/todo-store/contract";

const svc = await workers.resolveService("example.todos.v1");
if (svc.kind !== "durable-object") throw new Error("Expected DO service");

await rpc.call(svc.targetId, todoStoreRpcMethods.upsertTodo, [{ title: "Write storage docs" }]);
const todos = await rpc.call(svc.targetId, todoStoreRpcMethods.listTodos, []);
```

For a partitioned store, pass the optional second argument:

```ts
const projectStore = await workers.resolveService(
  "example.todos.v1",
  projectId,
);
```

For repeated calls, bind the same contract table with
`workers.durableObjectService(methods, protocol, objectKey?)`:

```ts
const projectTodos = workers.durableObjectService(
  todoStoreRpcMethods,
  "example.todos.v1",
  projectId,
);
const todos = await projectTodos.call("listTodos", []);
```

This resolves `do:<source>:<className>:<projectId>` and creates or activates a
separate SQLite database for that object key. Use stable, meaningful keys such
as a workspace, project, document, or account id. Use a random key only when
the app really wants a new isolated database.

Both the declaration and the receiver must admit the caller:

- A selected provider export's `authority.principals` controls which
  authenticated principal families may resolve the service in this context.
- Each method's `@rpc` contract separately enforces principals, tier, receiver
  relationships, and the concrete resource. A protected method owned by the
  provider binds a `userland-capability` effect to a definition in the provider
  package's `authority.provides`; the host acquires the authority before
  running provider code.

On a running system, including agent eval, test the real object through
`workers.resolveService(...)` / `workers.resolveDurableObject(...)` and separate
`rpc.call(...)` calls as above. That path exercises workerd, the live
declaration, the method's `@rpc` contract, and the object's persistent SQLite
database.

Which methods are exposed is decided by the active provider build,
not by the source currently in the workspace. After adding or changing an
exposed method on an existing declared service:

1. Verify the context candidate.
2. Commit the provider edits and publish that repository.
3. Wait for publication to finish and resolve the service again.
4. Only then call the changed method.

A green `verify` updates neither protected main nor the live service. A
`WORKSPACE_RPC_METHOD_UNDECLARED` failure reports the provenance of both the
active build and the most recently verified candidate when available, plus the
publication step needed to recover. Do not bypass it with raw addressing.

Prefer `resolveService(...)` whenever a service exists. Raw
`resolveDurableObject(...)` can address DO classes from workspace workers, but
host-internal DOs are not workspace targets and stay inaccessible.
Workspace-built DOs are admitted dynamically from the caller's live semantic
declarations and still require receiver authority for the specific
source/class/object key. Exporting a class does not grant access to all its
objects, and a different key is a different resource.

For co-located workerd tests, import test registration and assertions from
`@workspace/test-runtime`, and test pure logic without host-only dependencies.
Test real persistence and RPC authority through the running object's service or
durable-object interface shown above.

`createTestDO(...)` from `@workspace/runtime/worker/test-utils` is a Node-only
unit fixture. It builds an in-memory sql.js-backed object, so tests using it
must import `describe`, `it`, and `expect` from `vitest` and declare an explicit
native suite in the worker's `package.json`:

```json
"vibestudio": {
  "tests": [{ "name": "unit", "runtime": "native", "include": ["**/*.test.ts"] }]
}
```

Run that suite with `verify({ operation: "test", target:
"workers/my-store", suite: "unit" })`. Native execution requires the
`native.code.execute-tests` authority, and a failure never falls back to another
runtime. The fixture does not test workerd persistence or the RPC/policy layer.
It is not exported to workerd, browser tests, agent eval, or production
worker/DO code.

## Durable Object current schema

`DurableObjectBase` supports only the current SQLite schema.
`createTables()` declares the complete fresh schema and `schemaVersion` names
it. A truly empty store is initialized atomically. Every later open must match
the version and the required tables exactly; an older, newer, unversioned, or
drifted store is rejected unchanged with `DO_SCHEMA_INCOMPATIBLE`.

The product is pre-release, so there are no schema migration callbacks,
baselines, ledgers, or predecessor fixtures. When the schema changes, bump `schemaVersion` and the
coordinated `systemEpoch`, publish a new Base/template generation, and recreate
disposable internal state. Before the change, export valuable user data through
the product's current interface. Never store schema compatibility markers in
application rows or add a reader for the old format.

`workers.resetStorage(target, intent)` is an explicit destructive tool for one
disposable userland object, not an upgrade path. It fences that object,
verifies a backup, and returns its operation id. Backup listing and restore
work only on the same current target.

## Durable Object RPC Exposure & Authorization

DO methods are reachable over RPC only when explicitly opted in, and the
workspace enforces a per-method caller policy that denies by default. There are
two separate layers, and both are required. This section describes the
installed receiver contract; use the live capability docs for current callable
schemas.

### Layer 1 — `@rpc` exposure (which methods are callable)

A method without `@rpc` is private to the DO and cannot be called over the
relay; calling it fails with "not exposed". Mark every method callers need.

### Layer 2 — `@rpc({ website, principals, effect, tier, sensitivity })` receiver policy

The RPC relay is open between authenticated participants, so the receiver has
to enforce access. Every workspace method reachable through the relay declares
which authenticated principal families it accepts (`"host" | "user" | "code"`),
its effect, reviewed tier, and sensitivity. Each receiver must also make an
explicit website choice: `eligible` with a rationale, or `closed` with a
concrete reason. Eligibility grants no authority; connected websites must still
satisfy the resource and disclosure rules. See
[website authority](../capabilities/references/website-authority.md).

Missing policy means deny. Effects follow the rules in
[Userland Services](#userland-services): `{ kind: "open" }` for an unprotected
method (the service declaration adds the target requirement), or a
`userland-capability` effect matching `authority.provides`. Keep the policy
static (inline, or module-level `const`s in the same file), because live docs
are extracted from the source build without running it.

```ts
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";

export class MyStoreDO extends DurableObjectBase {
  @rpc({ website: { kind: "closed", reason: "Workspace data is not exposed to websites." }, principals: ["user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async addItem(label: string): Promise<{ id: string }> { ... }

  @rpc({ website: { kind: "closed", reason: "Host lifecycle traffic is not exposed to websites." }, principals: ["host"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async onWebhookDelivery(event: WebhookEvent): Promise<void> { ... }

  private bumpCounter(): void { ... }       // no @rpc — unreachable over RPC
}
```

Export the public app method from `workers/my-store/contract.ts` using the
receiver's actual method signature:

```ts
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { MyStoreDO } from "./index.js";

export const myStoreRpcMethods = createReceiverRpcMethods<
  Pick<MyStoreDO, "addItem">
>(["addItem"]);
```

Export `./contract` from the package. Import that descriptor table in the
consumer and pass `myStoreRpcMethods.addItem` with its `string` argument tuple.

Use `user` for direct user/session actions, `code` for installed workspace code
and agents, and `host` only for trusted host lifecycle traffic. Listing a
principal is only the receiver's minimum requirement: the caller's sealed
manifest, live grant, mission/context constraints, and service admission must
also allow the call.

Methods are callable only within their own workspace unless the declaration
also sets `crossWorkspace: true`. A caller in another workspace names the
destination on the RPC call:

```ts
@rpc({
  website: { kind: "closed", reason: "This integration is restricted to explicitly authorized workspace callers." },
  principals: ["code"],
  effect: { kind: "open" },
  tier: "open",
  sensitivity: "read",
  crossWorkspace: true,
})
async listAvailableSlots(): Promise<string[]> { ... }

const slots = await rpc.call(storeTargetId, myStoreRpcMethods.listAvailableSlots, [], {
  destination: { kind: "workspace", workspaceId: personalWorkspaceId },
});
```

This flag only exposes the receiver. The user's outgoing and incoming
workspace policies must both allow the destination, target, and method before
any service or capability approval is considered. System does not accept
cross-workspace application calls. Do not add a second export manifest, copy a
remote handle into the local workspace, or use a context ID to select a
workspace.

### Identity-level tightening (inline)

The principal floor is coarse: any DO caller has caller kind `"do"`. When a
method must accept only ONE specific caller (this agent's own EvalDO, the
agent's own PubSubChannel, a known class), add an inline check ON TOP of the
floor using the server-authenticated caller, which cannot be forged:

```ts
@rpc({ website: { kind: "closed", reason: "Internal agent callbacks are not exposed to websites." }, principals: ["code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
async onChannelOp(channelId: string): Promise<void> {
  await this.assertOwnEvalCaller(channelId); // only THIS agent's own EvalDO
  ...
}
// this.rpcCallerId / this.rpcCallerKind / this.caller are server-set from the
// validated token. Every DO, including server-realm DOs, uses @rpc authority.
```

### When to declare a userland capability

`@rpc` exposure decides whether a caller may call the method. For a sensitive
resource owned by userland code, also declare its authority at that receiver:

- **Built-in host actions** (credentials, external opens, git writes, project
  imports, webhooks, publishing main, spawning workers): call the existing
  runtime API and let its receiver acquire the host capability.
- **Custom shared resources** exposed to other userland callers: declare a
  capability in `vibestudio.authority.provides` and bind the method to its
  unit-local name with a `userland-capability` effect.

Never prompt from provider code or build your own grant store. The host handles
acquisition, persistence, scope, and revocation.

## Store

```ts
const stored = await credentials.store({
  label: "Example API",
  audience: [{ url: "https://api.example.com/", match: "origin" }],
  injection: {
    type: "header",
    name: "authorization",
    valueTemplate: "Bearer {token}",
  },
  material: { type: "bearer-token", token },
});
```

## OAuth Without Returning Tokens

Use `credentials.connect()` for OAuth. The host handles the redirect, browser
handoff, callback validation, token exchange, encrypted storage, and initial use
grant. For provider secrets/config, use `credentials.configureClient()` and pass
`clientConfigId`.

```ts
const stored = await credentials.connect({
  flow: {
    type: "oauth2-auth-code-pkce",
    authorizeUrl: "https://auth.example.com/oauth/authorize",
    tokenUrl: "https://auth.example.com/oauth/token",
    clientId: "public-client-id",
    scopes: ["read"],
  },
  credential: {
    label: "Example API",
    audience: [{ url: "https://api.example.com/", match: "origin" }],
    injection: {
      type: "header",
      name: "authorization",
      valueTemplate: "Bearer {token}",
    },
  },
  browser: "external", // or "internal" for an app browser panel
});
```

Use `type: "oauth2-device-code"` when a redirect-based flow cannot reach the
server: the provider rejects a Tailscale `*.ts.net` redirect URI, the install is
headless, or the user wants to authorize on another device. The server shows
the `user_code` on the trusted approval bar while it polls the token endpoint.
See [api-integrations SKILL.md](../api-integrations/SKILL.md#device-code-flow)
for the full provider compatibility matrix.

## Use

```ts
await credentials.fetch("https://api.example.com/v1/items", undefined, {
  credentialId: stored.id,
});
```

## Userland capability definitions

Every executable package's authority manifest contains both `requests` and
`provides`. `requests` is the most host or workspace-service authority the unit
may use; `provides` names protected resources the unit owns. Each provided
definition supplies the user-facing title/action, tier, sensitivity, resource
type, reviewed `presentation.domain` / `presentation.verb`, `notability`, and
allowed grant scopes. The domain and verb come from the shared authority
vocabulary; userland providers cannot declare the Safety controls domain.

`notability` is required. Ask: would a reasonable non-technical person, told
that a part can do this, want to know before adding it? If yes, use
`"headline"`; if it is routine machinery for a part like this, use
`"everyday"`. This decides what the user reads first in every install and
creation review, so answer honestly. Marking everything headline makes every
part look like a threat. The platform promotes a `critical` or `destructive`
definition to headline regardless of what you write.

Your declaration sets an upper limit and a vocabulary; it does not grant
anything. The platform may make a request more restrictive than you asked
(`admin` and `destructive` capabilities always ask at the moment of use), but
never less.

Bind a Durable Object receiver to a provided unit-local name:

```ts
@rpc({
  website: { kind: "closed", reason: "This integration is restricted to explicitly authorized workspace callers." },
  principals: ["code"],
  effect: {
    kind: "userland-capability",
    capability: "calendar.write",
    resource: { kind: "receiver-object" },
  },
  tier: "gated",
  sensitivity: "write",
})
async createCalendarEvent(input: CalendarEventInput): Promise<void> {
  // Authority has already been acquired for this exact provider/object.
}
```

Before dispatch, the host checks the literal effect against the provider's
manifest and effective version. For prepared private state, use the
opaque-handle pattern in [`skills/capabilities/SKILL.md`](../capabilities/SKILL.md).
Never pass a private selector to a caller, and never treat a handle as
permission.

## Agent Debug Port

When a channel looks stuck, check GAD first for the persisted trajectory state,
then the agent's in-memory debug snapshot:

```ts
const health = await gad.inspectAgentHealth({ channelId: chat.channelId });
const debug = await gad.inspectAgent({
  channelId: chat.channelId,
  method: "getDebugState",
});
console.log(JSON.stringify(debug.result, null, 2).slice(0, 4000));
```

`getDebugState` contains only loop state that is already loaded, plus local
SQLite outboxes. A loop with `loaded: false` is not loaded from GAD for this
call; use `health` for the persisted state. See `../../../docs/agent-debug-port.md`
for the full contract.

`gad.inspectAgent({ channelId, participantId?, method })` works for any
channel; `participantId` defaults to the channel's sole agent. It exposes only
`getDebugState`, `getAgentSettings`, and `inspectMethodSuspensions`, goes
through the channel's `channel.admin`-gated `inspectAgent` receiver, and uses a
dedicated read-only agent RPC instead of `onMethodCall`. A retired agent fails
without being reactivated. Use `chat.callMethod` only to invoke a participant's
own methods inside `chat.channelId`.

## Host Server Logs

For the panel, worker, DO, extension, or app execution itself, pass the
identity returned by `runtime.supervision.list()` to
`runtime.supervision.logs(identity)` or `health(identity)`. Use `serverLog` when
the failure may be in the workspace server around that unit: build/reconcile,
workerd supervision, routing, RPC dispatch, gateway reconnects, idle exit, or
startup/shutdown.

```ts
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";

const recent = await rpc.call("main", mainRpcMethods["serverLog.query"], [
  { level: "warn", limit: 100 },
]);
const build = await rpc.call("main", mainRpcMethods["serverLog.query"], [
  { tag: "BuildV2", limit: 100 },
]);
```

To follow live, open `about/server-logs` or subscribe to `server-log:append` as
described in `../server-logs/SKILL.md`.

## Blobstore (content-addressable bytes)

The per-workspace blobstore stores arbitrary content keyed by its sha256 digest.
Use it for anything large or binary: model outputs, fetched documents,
generated artifacts, or the object layer of a custom git-like format.

**Metadata via RPC** (uses the worker's existing `RPC_AUTH_TOKEN` automatically):

```ts
const exists = await callMain("blobstore.has", digest);
const meta = await callMain("blobstore.stat", digest); // { size, mtime } | null
```

**Streaming binary I/O via the gateway**:

```ts
// Writes are streaming — pass any Readable / ReadableStream as the body.
const put = await runtime.gatewayFetch("/_r/s/blobstore/blob", {
  method: "PUT",
  body,
});
const { digest, size } = await put.json();

const get = await runtime.gatewayFetch(`/_r/s/blobstore/blob/${digest}`);
// `get.body` is a ReadableStream of the original bytes.
```

`gatewayFetch` resolves a relative path against `GATEWAY_URL` and
authenticates the request with the worker's bearer token. An absolute URL is
accepted only if it has the gateway's origin; a cross-origin URL is rejected
before the token is sent. For external HTTP, use `credentials.fetch`, not
`gatewayFetch`. Worker tokens are minted by the central `TokenManager`, so the
route's `caller-token` auth accepts them.

`blobstore.delete` and `blobstore.list` are restricted to shell/server callers
and cannot be called from a worker; garbage collection belongs in a higher
layer, such as a server service.

Blobs are immutable and content-addressed. Store the returned digest in your
application state and fetch by that digest when rendering. A worker does not
garbage-collect blobs or list other callers' blobs.

Host RPC descriptors are exported by `@vibestudio/service-schemas/mainRpc`: import `mainRpcMethods` for the calls above.
