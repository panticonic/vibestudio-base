# Runtime API

Credentials are URL-bound and can only be used through host-mediated egress.

The portable runtime API is local to the workspace. `contextId` identifies a
context branch within the current workspace; it cannot select source from
another workspace. Panels, workers, Durable Objects, and eval load their code
and state from the workspace that owns the current runtime.

An explicit RPC destination can address an existing receiver in another
workspace when all of these hold:

- the calling user belongs to both workspaces;
- the outgoing policy of one workspace and the incoming policy of the other
  both permit the operation;
- the receiver method declares that it accepts cross-workspace calls.

The receiver's normal authorization checks still apply. A failure names the
check that denied the call, or returns the receiver's error. Cross-workspace
calls do not change where either runtime loads its code.

`services`, `hosts`, and `runtime` are portable `@workspace/runtime` exports.
They are the same caller-scoped clients in panels, workers, Durable Objects,
and eval, not eval-only helpers:

- `services` gives dynamic access to live service methods.
- `hosts` gives owner-scoped access to attached hosts.
- `runtime` is the typed lifecycle and supervision client.

`gatewayFetch` only talks to the gateway. It accepts a relative path or an
absolute URL on the configured gateway origin, and rejects a cross-origin URL
before any gateway credential is sent. Use `credentials.fetch` for external
HTTP.

The shared `fs` API has no built-in timeout: an operation runs until it settles
unless the caller passes an `AbortSignal`. Optional telemetry about settled
operations does not affect behavior.

## Panel Runtime Surface

In panel component code, the host injects a `panel` object with two
identities:

- `panel.slotId` is the stable visible panel slot. Use it for panel-tree
  operations and PubSub/channel clients.
- `panel.entityId` and `rpc.selfId` identify the current live runtime entity,
  which can change when the panel navigates or reopens.

`panel` is not exported from `@workspace/runtime`; do not import it in
server-side eval. Eval, workers, and Durable Objects work with visible panels
through `getParent()`, `openPanel()`, `getPanelHandle()`, and the `PanelHandle`
values returned by `panelTree`.

<!-- BEGIN GENERATED: panel-runtime-surface -->
Generated from `runtimeSurface.panel.ts`. Use `await help()` at runtime for the live surface.

| Export | Kind | Members | Description |
|--------|------|---------|-------------|
| `PanelOperationError` | value |  | Structured error class thrown by panel create, navigation, reload, rebuild, and readiness operations. Inspect its failure provenance instead of parsing message text. |
| `id` | value |  |  |
| `contextId` | value |  |  |
| `rpc` | value |  | Portable RPC client (the full createRpcClient). |
| `fs` | value |  | Per-context filesystem sandbox. Paths are context-root-relative. The semantic workspace records managed mutations before projection; moves preserve file identity and copies mint a new identity with exact copy provenance. Tracked-to-scratch renames, managed empty-directory mkdir, and open with write flags are rejected. Scratch mkdir and utimes remain direct filesystem operations. Platform-excluded paths and paths outside reserved workspace source roots are local scratch. |
| `callMain` | value |  | Call a `main` (server) service method: callMain("fs.readFile", path). |
| `getParent` | value |  | Get the parent panel handle, or null when there is no parent. |
| `getParentWithContract` | value |  | Get the parent handle typed by a panel contract, or null. |
| `doTargetId` | value |  | Build a unified RPC target ID for a Durable Object reference. |
| `createDurableObjectServiceClient` | value |  | Resolve a Durable Object-backed service and call it through unified RPC. |
| `gatewayConfig` | value |  | Gateway base URL and bearer token for Vibestudio service routes. |
| `gatewayFetch` | value |  | Gateway-origin fetch helper. It accepts relative paths and absolute URLs on the configured gateway origin, then authenticates that request; cross-origin targets are rejected. Use credentials.fetch for external egress. |
| `openExternal` | callable |  | Call `await openExternal(url, options?)` from the initialized panel, plain-worker, or eval runtime to open the system browser. A Durable Object uses its own `this.rpc.call("main", "externalOpen.openExternal", [url, options])`. The call owns the approval prompt and resumes after the user decides. |
| `workers` | namespace | `listSources`, `create`, `createDurableObject`, `list`, `destroy`, `resetStorage`, `listStorageBackups`, `restoreStorageBackup`, `listServices`, `resolveService`, `resolveDurableObject`, `durableObjectService` | Worker discovery, lifecycle, and manifest-declared service resolution. Use create/list/destroy for regular worker instances; listSources() returns every launchable source with its real manifest entry point and Durable Object classes. |
| `workspaces` | namespace | `create`, `receipt` | Create workspaces from exact inspected template pins and reconcile durable receipts. Available to panels, workers, eval and connected websites under ordinary caller authorization. Creation returns no routing credentials or authority over the new workspace. |
| `credentials` | namespace | `store`, `connect`, `beginWebsitePublication`, `recordWebsitePublication`, `configureClient`, `requestCredentialInput`, `getClientConfigStatus`, `deleteClientConfig`, `listStoredCredentials`, `summarizeStoredCredentials`, `inspectStoredCredentials`, `revokeCredential`, `resolveCredential`, `deriveCredential`, `fetch`, `publishFetch`, `hookForUrl`, `gitHttp`, `forAudience` | Typed credential lifecycle and credentialed network access. Use resolveCredential({ url }) for host-owned audience matching; an unbound URL returns null without UI. Inventory summaries do not replace the resolver's binding and use policy. Use store(input) to persist a URL-bound credential, fetch(url, init?, { credentialId? }?) for credentialed HTTP and a standard Response, hookForUrl(url, { credentialId? }?) for a bound fetch function, gitHttp({ credentialId?, gitIntent? }) for smart-HTTP, and forAudience(descriptor) for a credential-bound handle. The underlying RPC transport is internal. |
| `browserData` | namespace | `getBrowserEnvironment`, `listImportHosts`, `listImportAcquisitionOptions`, `beginImportAcquisition`, `releaseImportSource`, `listImportSources`, `previewImport`, `previewSensitiveImport`, `startImport`, `startSensitiveImport`, `observeSensitiveImport`, `cancelSensitiveImport`, `openBrowserPrivacyManager`, `cancelImport`, `getImportJob`, `observeImportJob`, `listImportJobs`, `listOpenTabs`, `openTabsAsPanels`, `getSitePreferences`, `setSiteZoom`, `getBookmarks`, `addBookmark`, `updateBookmark`, `deleteBookmark`, `moveBookmark`, `searchBookmarks`, `getHistory`, `deleteHistoryEntry`, `deleteHistoryRange`, `clearAllHistory`, `searchHistory`, `searchHistoryForAutocomplete`, `recordHistoryVisit`, `updateHistoryTitle`, `getSearchEngines`, `setDefaultEngine`, `saveSearchEngine`, `getSearchSuggestions`, `listDownloads`, `listDownloadRecords`, `upsertDownloadRecord`, `pauseDownload`, `resumeDownload`, `cancelDownload`, `openDownload`, `revealDownload`, `putPageFavicon`, `getPageFavicon`, `exportBookmarks` | Typed access to the manifest-declared browser-data provider: detection, import, secret-free summaries, approved sensitive reads, mutation, and export. |
| `git` | namespace | `setSharedRemote`, `removeSharedRemote`, `setUpstream`, `removeUpstream`, `detachUpstream`, `setAutoPush`, `upstreamStatus`, `createBranch`, `pushUpstream`, `pullUpstream`, `publishRepo`, `commitMapping`, `importProject` | Typed external Git operations routed through the workspace's configured gitInterop provider. Import and pull create unpublished semantic candidates; only ordinary VCS integration and explicit publication advance protected main. Declarations carry logical credential names resolved by the host, while credential-free remotes are anonymous-first. Pull dry-runs use isolated temporary state and do not mutate managed Git, semantic state, or the remote. |
| `vcs` | namespace | `edit`, `move`, `copy`, `merge`, `revert`, `commit`, `discard`, `importSnapshot`, `registerExternalDelta`, `supersedeExternalDelta`, `finalizeExternalDelta`, `push`, `mainState`, `status`, `compare`, `inspect`, `neighbors`, `history`, `walk`, `query`, `search`, `blame`, `readMemory`, `resolveRepository`, `readFile`, `listDirectory`, `listFiles`, `publish` | Simple semantic version control: exact event/application state, expressive edit/move/copy records, incremental local integration, whole-chain commit/discard, directly walkable provenance, and atomic external-snapshot acknowledgements containing the committed event/application/work-unit/repository/snapshot tuple. |
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
| `isRpcConnectionLost` | value |  | Recognize a retired or disconnected RPC session. |
| `launchAgentIntoChannel` | value |  | Launch and subscribe an agent through explicit runtime clients and one owned identity. A module-level factory, not a runtime instance member. |
| `createConversationClient` | value |  | Bind a conversation client to an explicit RPC client. A module-level factory, not a runtime instance member. |
| `createPanelRuntime` | value |  | Create the complete panel API with explicit transport, bootstrap, presentation inputs and lifetime ownership. No injected globals are required. |
| `connectWorkspace` | value |  | Explicitly ask the presentation host to connect this website to its workspace, then bind the same runtime API used by installed panels. Calls never connect implicitly. |
| `disconnectWorkspace` | value |  | Disconnect this document and retire its RPC calls, streams and borrowed clients. |
| `workspaceConnection` | namespace | `connected`, `available`, `kind`, `status`, `error`, `subscribe` | Observe connection state without workspace access. status is unavailable, disconnected, connecting, connected or disconnecting; error is the latest failed action's message or null. subscribe returns an unsubscribe function. |
| `workspace` | namespace | `getInfo`, `getActive`, `getConfig`, `validateConfig`, `setInitPanels`, `setConfigField`, `applyPreparedConfig`, `getAgentResources`, `getAgentsMd`, `listSkills`, `readSkill`, `sourceTree`, `ensureContextFolder`, `findUnitForPath`, `projects` | Workspace catalog, source tree, and unit helpers. Does not include panelTree; import top-level panelTree for panel-tree handles. |
| `createPanelSlot` | value |  | Commit a panel under the caller and promptly return its durable handle without focusing or waiting for activation, build, or boot. Server reconciliation owns activation after commit and recovers it across transient failure or restart. Pass operationId for retry-stable identity across exact redelivery; source, contextId, parentId, and ref are also part of that identity. Do not combine operationId with slug. Use handle.observe() when current lifecycle state matters. |
| `openPanel` | value |  | Create a panel and return its handle after the exact attempt is application boot-ready, with no fixed readiness deadline. Pass options.signal for caller-owned cancellation and operationId for retry-stable exact redelivery; source, contextId, parentId, and ref are also part of that identity. Do not combine operationId with slug. It defaults under the caller and focused; use parentId:null for a root or focus:false to suppress presentation. options.placement accepts "side" (default), "side-if-room", "replace", or "split-below". The returned PanelHandle is the complete lifecycle and inspection API. Use `const session = await handle.cdp.session(); const page = session.page` for automation. Keep the stable page across rebuild/navigation; its next awaited operation rebinds without replaying the interrupted action. `session.receipt` reports acquired, reconnected, or replaced generations. For a one-call host image use `await handle.cdp.screenshot({ format: "png" })`. For host-captured logs since panel creation use `await handle.cdp.consoleHistory()` (live page console events are separate). |
| `getPanelHandle` | value |  |  |
| `panelTree` | namespace | `self`, `get`, `rootOwners`, `roots`, `rootsForOwner`, `children`, `page`, `walk`, `path`, `search`, `parent`, `navigate`, `navigateHistory` | Top-level export, not workspace.panelTree. self/get are synchronous handle factories. Use roots(input?) for the current human subject, rootOwners() then rootsForOwner(ownerUserId) for cross-owner inspection, or children(parentSlotId); each returns a bounded page with entries. walk(rootSlotId, { limit }) async-iterates a bounded subtree breadth-first. page(...) is the advanced discriminated-group primitive. search(...) returns hits containing entry.node and entry.handle. Handle navigate/navigateHistory/focus/reload/rebuild return a boot-ready PanelObservation; observe is the sole live status read. |
| `Rpc` | value |  | RPC helpers namespace export. |
| `z` | value |  | Zod export. |
| `defineContract` | value |  |  |
| `buildPanelLink` | value |  | Build a logical panel link. options.workspace selects an exact name, { id }, or { role: system \| personal }; omitted stays local. disposition controls destination tree placement; placement controls visual layout. |
| `buildPanelDeepLink` | value |  | Build a canonical panel deep link with optional tree disposition and visual placement hints. |
| `buildPanelShareLink` | value |  | Build a canonical panel share link with optional tree disposition and visual placement hints. |
| `parseContextId` | value |  |  |
| `isValidContextId` | value |  |  |
| `getInstanceId` | value |  |  |
| `normalizePath` | value |  |  |
| `getFileName` | value |  |  |
| `resolvePath` | value |  |  |
| `createGatewayFetch` | value |  | Create a gateway-authenticated fetch helper from an explicit config. |
| `FORM_FILL_TYPES` | value |  | Canonical HTML autocomplete field vocabulary recognized by browser form fill. |
| `panel` | namespace | `entityId`, `slotId`, `parentId`, `env`, `setTitle`, `getInfo`, `focusPanel`, `getTheme`, `onThemeChange`, `registerHostCommands`, `onFocus`, `onConnectionError`, `onChildCreated`, `reopen`, `stateArgs` | Panel-only affordances: identity (entityId/slotId/parentId/env), semantic display title (setTitle(title, { explicit? })), introspection (getInfo/getTheme/onThemeChange/onFocus/onConnectionError), host-local command contribution (registerHostCommands(commands, onRun) returns a disposer; registrations merge and ids must be unique across the panel), lifecycle (focusPanel/onChildCreated/reopen), and stateArgs (get/patch/patchForPanel; patch is an RFC 7386 JSON merge patch where null deletes a key). |
| `journal` | namespace | `Journal`, `with`, `current` | Panel operation journaling: journal.Journal (class), journal.with(journal, fn), journal.current(). |
| `agentApi` | value |  |  |
| `adblock` | namespace | `getStats`, `isActive`, `getStatsForPanel`, `isEnabledForPanel`, `setEnabledForPanel`, `resetStatsForPanel`, `getPanelUrl`, `addToWhitelist`, `removeFromWhitelist` |  |
<!-- END GENERATED: panel-runtime-surface -->

Workspace source is managed by a semantic VCS that records exact event and
application states. Read [vibestudio-vcs](../vibestudio-vcs/SKILL.md) before
you mutate, compare, commit, import, or publish source. Use `git` only for
transport to and from external remotes, and bring external content in with a
single `vcs.importSnapshot` call rather than local edits. A successful import
atomically returns the committed event, application, work unit, admitted
repositories, and snapshot. A non-Git snapshot may contain several repositories
when importing them separately would expose an inconsistent partial state. A
Git import contains exactly one repository, so unrelated remotes never share
provenance.

For external Git smart HTTP, construct `GitClient` from `@vibestudio/git` with
`credentials.gitHttp()`. For workspace-managed external repo declarations,
startup auto-import, branches, approvals, and retries for private repos, see
`skills/onboarding/EXTERNAL_GIT_PROJECTS.md`.

### Filesystem capability discovery

The context filesystem API is the same in eval, panels, workers, and Durable
Objects. Eval has `fs` injected; portable code imports `fs` from
`@workspace/runtime`. Run `await help("fs")` for the live method list and
`await help("fs.<method>")` for a method's arguments and examples.

`lstat()`, `readlink()`, and `realpath()` inspect symbolic links.
`symlink(target, path, type?)` creates one in context-local scratch. The link
and its resolved target must both stay inside the virtual context root: an
absolute target is interpreted relative to that root and stored as a relative
target. Creating a link under a GAD workspace repo is rejected because GAD
states cannot represent links; use `copyFile()` when the destination must be
tracked workspace source. There is no `chown()`.

## Current Workspace

Use `workspace` for workspace metadata, `build.listUnits()` for declared units
and their build readiness, and `runtime.supervision` for live executions:

```ts
import { contextId, rpc, runtime, workspace } from "@workspace/runtime";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";

const active = await workspace.getActive();
const units = await rpc.call("main", mainRpcMethods["build.listUnits"], []);
const live = await runtime.supervision.list();

console.log({ contextId, active });
console.log({ declared: units.slice(0, 5), live: live.slice(0, 5) });
```

`workspace.getActive()` returns the id of the workspace the current runtime
belongs to. `build.listUnits()` returns declared units and their immutable
build status.

Every supervision row carries its live entity `identity` and, for apps and
extensions, its `release` key `{ kind, releaseId }`, where `releaseId` is the
`name` returned by `build.listUnits()`, spelled exactly as returned (it looks
like a package name). `describe` and `logs` accept either key: an identity
selects that entity, a release key fans out to every live entity of the
release. `health(identity)` and `restart(identity)` take an entity identity;
`versions(release)` and `rollback(release, options)` take a release key and
work even when no process is running. Do not pass a source path as a release
ID.

Server-wide workspace selection and catalog operations belong to the human
shell or the CLI's hub session, and are deliberately unavailable in runtime
eval. A System management page may select another workspace as a resource,
but that neither loads its source into the current runtime nor grants its
permissions.

Workspace host logs are available through the service catalog, not as an
`@workspace/runtime` namespace. In eval, use `services.serverLog.tail/query/stats`
or raw RPC such as
`rpc.call("main", mainRpcMethods["serverLog.query"], [{ level: "warn", limit: 100 }])`. To
follow logs live, use
`EventsClient.openWatch(rpc, ["server-log:append"], crypto.randomUUID(), { signal })`;
cancelling that response is the only way to unsubscribe. Humans can open the
`about/server-logs` viewer. The `skills/server-logs/SKILL.md` skill in the
System workspace has the full contract and the cleanup pattern.

## People, Membership, and Presence

Use the service that matches the question:

```ts
const profile = await services.account.getProfile();
const members = await services.account.listWorkspaceMembers();
const present = await services.workspacePresence.list();
const channelParticipants = await chat.getParticipants(); // type/name/isPerson/isAgent

return { profile, members, present, channelParticipants };
```

- `account.getProfile()` returns the verified user behind the current
  authenticated call. This is not the identity of the executing agent or
  runtime.
- `account.listWorkspaceMembers()` returns all workspace members, online or
  not, with their workspace role (`admin` or `member`). This role is separate
  from the account's `accountRole`. Personal and System privacy are not
  expressed through member roles.
- `workspacePresence.list()` returns the humans currently present in the
  workspace. An empty list is a valid result.
- `chat.getParticipants()` returns the current conversation's roster,
  including agents and headless participants. Each row exposes `id`, `ref`,
  `type`, `name`, `isPerson`, `isAgent`, and optional `handle`/`methods`
  directly. `headless` and `panel` rows are client transports, not agents.
  `chat` exists only in channel-bound agent eval.
- `gad.inspectChannelRoster` is the stored diagnostic view of a channel
  roster. It does not report workspace presence.

See [CHAT_API.md](CHAT_API.md) for the channel interface. The workspace runtime
has no access to the shell's hub session, so `hubControl` cannot be used to
discover other workspaces from eval.

## Notifications

Use `notifications.show()` for notifications in the host shell:

```ts
import { notifications } from "@workspace/runtime";

const id = await notifications.show({
  type: "info",
  title: "Notification test",
  message: "notification-show-marker",
  actions: [{ label: "Accept" }, { label: "Decline" }],
});

// The host issued this opaque id. Keep it only if this runtime may need to
// dismiss the notification later.
await notifications.dismiss(id);
```

`type` may be `info`, `success`, `warning`, `error`, or `consent`, and defaults
to `info`. Put the notification text in `message`. The host derives ids from
the verified caller and fresh randomness, so callers cannot supply, reuse, or
forge one. Only the runtime that created a notification can dismiss it, and
only an authenticated shell can report a user click.

Notifications are transient and go only to live sessions of the caller's
verified account. A returned id means the host accepted the notification, not
that anyone saw it. Report progress and completion in the conversation; use a
notification only for a brief alert that helps while the user is connected.
Notification callbacks live in the creating runtime's memory and are not a
durable workflow or approval mechanism.

For conversation messages and persistent inbox alerts, use the agent `notify`
tool; see [Messaging](../messaging/SKILL.md). Its message ids and inbox delivery
are separate from these transient notifications.

## Webhook Subscriptions

The portable `webhooks` namespace manages webhook subscriptions from panels,
workers, DOs, and agent eval:

```ts
import { webhooks } from "@workspace/runtime";

const self = await agent.describe();
const created = await webhooks.createSubscription({
  label: "temporary lifecycle probe",
  target: {
    source: self.identity.source,
    className: self.identity.className,
    objectKey: self.identity.objectKey,
    method: "getDebugState",
  },
  delivery: { mode: "direct" },
  payload: { type: "json" },
  verifier: {
    type: "bearer",
    headerName: "Authorization",
    token: `probe-${crypto.randomUUID()}`,
    scheme: "Bearer",
  },
  response: {
    successStatus: 202,
    malformedPayload: "reject",
    dispatchError: "retry",
  },
});

try {
  const listed = await webhooks.listSubscriptions();
  const rotated = await webhooks.rotateSecret(created.subscriptionId);
  // Do not print or return rotated.secret. Store it only if the integration needs it.
  return {
    created: listed.some(
      (row) => row.subscriptionId === created.subscriptionId,
    ),
  };
} finally {
  await webhooks.revokeSubscription(created.subscriptionId);
}
```

`listSubscriptions()` returns only active subscriptions, so a revoked
subscription disappears from the default list. For audit or history, request
redacted tombstones with `listSubscriptions({ includeRevoked: true })`.

Subscriptions are owner-scoped. For worker and DO callers (including agent
eval), `target.source` must be the caller's own source;
`agent.describe().identity` gives the correct source, class, and object key. A
target is invoked only when a public delivery arrives, so a
create/list/rotate/revoke probe has no side effects. `direct` delivery requires
a co-located public gateway; `relay` requires a configured relay URL. If
neither is available, report that error. Do not invent a target or switch to
an unrelated service.

### Workspace semantic VCS

The `vcs` namespace covers the whole workspace and is generated from its
schema. Run `await help("vcs")` for the live method list, then
`await help("vcs.edit")` (or another method name) for arguments. The
[VCS skill](../vibestudio-vcs/SKILL.md) explains the semantics; this guide does
not repeat the method catalog.

Key rules:

- `status` returns the committed event and the working event/application node.
- Every context mutation takes `expectedWorkingHead`; the client mints its
  `commandId`.
- `compare` classifies source changes against one target state.
- `merge` appends local accounting decisions keyed by stable coordinates.
- `commit` and `discard` act on the entire local application chain.
- `move` and `copy` record identity and content provenance explicitly.
- Validate the current context with the normal build and test services; VCS
  has no separate preview build.
- `push` publishes one already-committed event after the protected checks
  pass.

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
handoff, callback validation, token exchange, encrypted storage, and the
initial use grant. If the provider needs a client secret or other setup
material, collect it with `credentials.configureClient()` and pass the
resulting `clientConfigId` to `connect`.

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

## Use

```ts
await credentials.fetch("https://api.example.com/v1/items", undefined, {
  credentialId: stored.id,
});
```

## Durable Object-backed App Databases

For shared application data, use a worker Durable Object with SQLite
(`this.sql`) and expose narrow RPC methods. Do not keep panel or app state that
another runtime must read in the eval `db`; it is private to the agent's
EvalDO.

Resolve the service by protocol or name, optionally with an object key for a
partitioned database, then call the DO target:

```ts
import { rpc, workers } from "@workspace/runtime";
import { todoStoreRpcMethods } from "@workspace-workers/todo-store/contract";

const store = await workers.resolveService("example.todos.v1", "project-123");
if (store.kind !== "durable-object") throw new Error("Expected DO service");

await rpc.call(store.targetId, todoStoreRpcMethods.upsertTodo, [{ title: "Ship the app" }]);
const rows = await rpc.call(store.targetId, todoStoreRpcMethods.listTodos, []);
```

The worker must admit the caller in two places: the live service's
`authority.principals` gate, and the
`@rpc({ website, principals, effect, tier, sensitivity })` receiver policy on
each exposed DO method. See
[workspace-dev/WORKERS.md](../workspace-dev/WORKERS.md#durable-object-backed-app-databases)
for the schema, declaration, partition-key, and testing recipe.

## Unified Panel Handles

Use `panelTree` and `PanelHandle` from panels, workers, and DOs. Import
`panelTree` directly from `@workspace/runtime`; there is no
`workspace.panelTree`.

> **Headless tree root:** an eval with no visible panel has a tree but no
> initial panel node, so `getParent()` returns `null`. If the workflow
> needs a child panel, create your own root first and set the parent
> explicitly: `const root = await openPanel("about/new", { parentId: null });`
> then `const child = await openPanel(source, { parentId: root.id });`. Archive
> `root` when done to remove the subtree. A null `getParent()` is not an error.

```ts
import { panelTree, openPanel } from "@workspace/runtime";

const created = await openPanel("https://example.com", { focus: true });
const same = panelTree.get(created.id);
const parent = panelTree.self().parent();
const parentObservation = parent ? await parent.observe() : null;
const roots = await panelTree.roots({ limit: 100 }); // current human subject
console.log(roots.entries.map(({ handle }) => handle.title));
const rootOwnerPage = await panelTree.rootOwners({ limit: 100 });
for (const owner of rootOwnerPage.owners) {
  const ownedRoots = await panelTree.rootsForOwner(owner.ownerUserId, {
    limit: 100,
  });
  console.log(ownedRoots.entries.map(({ handle }) => handle.title));
}
const workspaceRoots = await panelTree.rootsForOwner(null, { limit: 100 });
const children = await panelTree.children(created.id, { limit: 100 });
const existing = (
  await panelTree.search({ query: "New Panel", limit: 20 })
).hits.find(({ entry }) => entry.handle.source === "about/new")?.entry.handle;
const byKnownSlot = panelTree.get("panel-slot-id");
const before = await byKnownSlot.observe(); // exact attempt and provenance
await byKnownSlot.setTitle("Semantic panel title", { explicit: true });
await byKnownSlot.navigate("about/new", { contextId: "ctx-vault" }); // state, files, and code from ctx-vault
await byKnownSlot.navigate("about/new", {
  contextId: "ctx-vault",
  ref: "main",
}); // ctx-vault state and files, protected main code
```

Panel state arguments are on the returned handle. The host validates and
persists them, so you can check a change immediately without reading an
internal workspace service:

```ts
const root = await openPanel("about/new", { parentId: null, focus: false });
try {
  const handle = await openPanel("about/new", {
    parentId: root.id,
    stateArgs: { mode: "fixture" },
    focus: false,
  });
  const before = await handle.stateArgs.get();
  const afterPatch = await handle.stateArgs.patch({ mode: "live" });
  const after = await handle.stateArgs.get();
  await handle.archive();
  console.log({ before, afterPatch, after });
} finally {
  await root.archive();
}
```

For recursive collection supervision, semantic grouping, shared orchestration
contexts, notes, and bounded child-panel automation, use Personal's optional
`about/collection` unit. The panel tree API above is available in every Base
composition.

### Eval And Visible Panel Perspective

In server-side eval, `panelTree.self()` is the EvalDO runtime, not the visible
chat panel. Use `getParent()` to get the owning agent's nearest
visible panel ancestor. To inspect the panel tree the user is talking about,
use bounded `panelTree.roots()`, `panelTree.children()`, and
`panelTree.search()` reads. To find the chat attached to a parent or sibling
panel, read that panel's state args:

```ts
import { gad, panelTree } from "@workspace/runtime";

const target = panelTree.get("panel-slot-id");
const stateArgs = target
  ? await target.stateArgs.get<Record<string, unknown>>()
  : {};
const channelId = String(stateArgs.channelName ?? stateArgs.channelId ?? "");

const health = channelId ? await gad.inspectAgentHealth({ channelId }) : null;

// Optional read-only debug state of that channel's agent.
const debug = channelId
  ? await gad.inspectAgent({ channelId, method: "getDebugState" })
  : null;
```

For the complete root/child verification and cleanup pattern, see
`EVAL.md#eval-perspective`.

Do not assume `chat.channelId` is the target panel's channel unless the user
means the chat the agent is responding in.

`openPanel()` creates a panel that your workflow owns. Handles from
`list`/`roots`/`children`/`get` refer to existing panels; do not call
`handle.navigate`, `handle.reload`, or `handle.archive` on them unless asked.
To replace the current panel's state or files from inside it, use
`reopen({ contextId, stateArgs })`. A panel's code builds from its own context
(`ctx:<contextId>`) unless a navigation API that accepts `ref` is given other
code to run.

For web automation, open your own browser panel with `openPanel("https://...")`.
Do not use the current chat panel, a parent chat panel, or any other workspace
panel as a throwaway browser. `handle.navigate(url)` and `page.goto(url)`
replace whatever the target panel shows, so use them only on a browser panel
you opened or one the user asked you to replace.

`PanelHandle` combines observation, RPC, lifecycle, state, tree, and CDP:

```ts
const current = await same.observe();
await same.focus(); // returns only after application boot-ready
const state = await same.stateArgs.patch({ mode: "review" });
// patch() merges objects recursively, deletes null-valued keys, and replaces arrays.
// Use null to remove a key: await same.stateArgs.patch({ mode: null });
await same.call.someExposedMethod();

const session = await same.cdp.session();
const page = session.page;
await page.title();
page.url(); // string, synchronous like Playwright
await same.click("button");
```

`await openPanel(...)` returns only after the selected immutable attempt is
application boot-ready, whether or not the panel is focused. `focus()`,
`navigate()`, `reload()`, and `rebuild()` complete the same way. The handle has
no separate lease or load status; `observe().phase === "ready"` is the only
positive readiness signal. `snapshot()` returns
`{ panelId, attemptId, runtimeEntityId, buildKey, capturedAt, document }`.

`same.cdp.session()` returns the panel's stable `panel-cdp-session.v1` session,
holding a Playwright-style page that binds to the current attempt/runtime/build
generation at awaited operation boundaries. After a rebuild or navigation,
keep using `session.page`; its next awaited operation rebinds without replaying
the interrupted action. Read `session.receipt` to distinguish acquisition,
reconnection, and replacement. This uses the workerd-native CDP client
(`@workspace/cdp-client`). This is the only browser-automation API: there is no
compatibility tier, and you do not import or install any `playwright*` package.
The page exposes locators (`page.locator`, `page.getByRole`, `page.getByText`,
`page.getByLabel`, …), auto-waiting actions (`click`, `fill`, `check`,
`selectOption`, …), reads (`innerText`, `count`, `isVisible`, `getAttribute`,
…), and page-level methods (`goto`, `screenshot`, `waitForSelector`,
`evaluate`, …). For protocol-level work,
`import { CdpConnection } from "@workspace/cdp-client"` and connect with
`(await same.cdp.getCdpEndpoint())`.

`openPanel`, `panelTree`, and `PanelHandle` are portable `@workspace/runtime`
APIs that work from server-side eval, panels, workers, and DOs. `handle.cdp.*`
is workerd-native and talks to the panel's CDP endpoint over a WebSocket, so
eval can open or find a panel and drive its browser target directly.

Operations that wait for readiness first ensure a host lease (idempotently),
then wait. Programmatic runtimes prefer the headless CDP host and fall back to
a CDP-capable desktop host; a native desktop focus bridge loads the panel on
that desktop instead. `unload()` releases only the presentation resource, so a
later focus, navigation, reload, rebuild, snapshot, or CDP operation loads the
unchanged panel again. `observe()` is a pure read and never reacquires an
evicted host. While a host is reconnecting, its lease may stay in place for
routing, but its earlier ready state is not reported. Readiness waits have no
fixed deadline; pass the operation's `signal` to cancel one. A panel held by a
mobile host, or a host that fails to load the panel, settles the wait
immediately with a structured host failure.

CDP and structural operations require approval on first use, per requesting
runtime entity and target panel. Privileged shell/about targets get a
high-danger approval prompt. If a target cannot become application-ready, the
waiting operation throws `PanelOperationError` with structured
stage/code/provenance. Call `handle.diagnose()` for one bounded observation,
console/lifecycle history, and the ready document. A target held by a mobile or
other non-CDP host rejects CDP access.

## Userland-owned capabilities

There is no portable `approvals` namespace. A workspace provider protects a
custom resource by declaring it in its package manifest's
`vibestudio.authority.provides` and binding the receiving `@rpc` method to that
unit-local name with a literal `userland-capability` effect. The host derives
the receiver resource and runs the trusted acquisition flow before provider
code executes.

To see which grants are active, use the permission inventory:

```ts
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
const grants = await rpc.call("main", mainRpcMethods["permissions.list"], []);
```

Use `permissions.listAgentProfiles` for each agent's standing permissions and
locks in readable form. Do not add your own prompts around `openExternal()`,
`credentials.*`, `git.*`, `vcs.*`, panel operations, or other host-mediated
APIs; their receivers already apply the right scope and audit. The
[capabilities skill](../capabilities/SKILL.md) documents complete
receiver-object and opaque-handle provider patterns.

## Workspace VCS operations

Read [vibestudio-vcs](../vibestudio-vcs/SKILL.md) and the live `help("vcs")`
schema. That skill is the maintained guide for semantic edits, comparison and
integration, commit and remainder handling, move/copy, external snapshot
import (including multi-repository non-Git bootstrap), revert by
counteraction, provenance, typed recovery, and protected publication.
