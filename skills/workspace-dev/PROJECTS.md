# Prepare workspace projects

Creating a project takes two stages. First prepare a candidate in the current
context; then review, verify, commit, and publish that candidate through the
normal VCS workflow. Preparation never commits, pushes, activates code, or
grants authority. There is no single call that creates and publishes, and no
helper for recovering a failed publication.

## Unit icons

The `icon` argument of `prepareProjects` and `prepareApplication` accepts a
catalog ID, a single emoji, or a unit-relative image path. A catalog ID is
converted into `assets/icon.svg`, and the manifest's `vibestudio.icon` stores
its `./` path. Never write a catalog ID into a manifest. Use
`searchProjectCatalog` to find icons, `setUnitIcon` to change the icon of an
existing executable unit, and `prepareUnitIcon` to prepare artwork for units
you write by hand. See the [shared icon guide](references/icons.md) for
examples and receipt details.

## Connected application and explicit authority

Use `prepareApplication({ name, title?, icon?, authority })` for a React panel
backed by a SQLite Durable Object store. In one atomic context edit it prepares
`panels/<name>`, `workers/<name>-store`, the protocol `<name>.v1`, the singleton
key `main`, and the matching service configuration.

The result is an editable, connected starting point, not a finished application
or a fixed service API. Its initial records have `id`, `title`, and timestamps,
and `listRecords`/`upsertRecord` are only the first methods. Build the user's
features by editing the generated panel and worker: design the domain data,
SQLite schema, typed RPC methods, and UI together. If the app needs richer
state, change the record contract; the starter's limits are not a reason to
stop.

Review authority again as you extend the code. Every new or changed receiver
method needs its own complete literal policy (website eligibility, principals
or requirements, effect, tier, sensitivity). Update unit requests and service
wiring only for the effects you intend. The policy passed to preparation does
not cover future effects. Verify provider and consumer in the same candidate,
then commit and publish the finished application, not just the starter. See
[WORKERS.md](WORKERS.md) for persistent storage and RPC contracts and
[PANEL_DEBUG_LOOP.md](PANEL_DEBUG_LOOP.md) for live verification.

You must supply the complete `ApplicationAuthorityPolicy`:

- `rationale`: the data, callers, effects, scopes, and the authority you chose
  not to request.
- `panel` and `worker`: complete unit manifests (`requests`, `provides`, and
  any `serviceRequests`). An empty `requests` list must be a deliberate
  decision, not a default.
- `service`: the chosen `principals`, `binding`, and `notability`.
- `methods`: complete literal receiver contracts for `listRecords` and
  `upsertRecord`, including website eligibility, principals or requirements,
  effect, tier, and sensitivity.

Preparation does not infer or add a consumer request, protocol request,
context-boundary permission, or context-clone permission. It keeps the policy
as given, and the build report flags missing or incompatible declarations.
Weigh its repair suggestions; do not add permissions blindly. A rationale
supports review; it does not authorize anything or prove least privilege.

This example chooses private workspace records with no downstream host
effects. Write a different policy when the real application needs one; do not
copy this one for credentials, sharing, network egress, or destructive work:

```ts
import { prepareApplication } from "@workspace-skills/workspace-dev";

scope.authorityPolicy = {
  rationale:
    "Private workspace records. Only this panel receives reviewed service wiring; other callers need consent. No website access or downstream host effects.",
  panel: {
    requests: [
      {
        capability: "workspace-service:task-board-store",
        resource: {
          kind: "exact",
          key: "do:workers/task-board-store:TaskBoardStore:main",
        },
        tier: "gated",
        evidence: "exact",
      },
    ],
    provides: [],
    serviceRequests: [{ protocol: "task-board.v1", availability: "required" }],
  },
  worker: { requests: [], provides: [] },
  service: {
    principals: ["user", "code"],
    binding: { declaredFor: ["panels/task-board"] },
    notability: "everyday",
  },
  methods: {
    listRecords: {
      website: { kind: "closed", reason: "Workspace-private records" },
      principals: ["user", "code"],
      effect: { kind: "open" },
      tier: "open",
      sensitivity: "read",
    },
    upsertRecord: {
      website: { kind: "closed", reason: "Workspace-private records" },
      principals: ["user", "code"],
      effect: { kind: "open" },
      tier: "open",
      sensitivity: "write",
    },
  },
};
scope.prepared = await prepareApplication({
  name: "task-board",
  title: "Task Board",
  authority: scope.authorityPolicy,
});
scope.panelSource = scope.prepared.panel.created;
scope.workerSource = scope.prepared.worker.created;
return scope.prepared;
```

The result is an object `{ panel, worker, service, preparation, authorityReview }`,
not an array. Each unit has
`{ created, files, preflight, preparation, authorityReview }`. `preparation`
contains `contextId`, the returned `workingHead`, `publication: "unchanged"`,
and `liveRuntime: "unchanged"`. Each unit's review contains the materialized
manifest and rationale; the application review also includes the service and
receiver policy you supplied. `AUTHORITY.md` in each executable repository
records the rationale. After customizing, review the source and manifests
again; this receipt does not approve later edits.

Preparation refuses, rather than overwrites, an existing repository, service
name, protocol, or singleton identity. The service is already declared in the
candidate; use `workspace_service` only to change it deliberately later.

## Independent repositories

Use `prepareProjects(projects)` for standalone units or custom wiring. It
returns an array of unit receipts and never wires repositories together. Every
panel or worker needs explicit `authority` and `authorityReason`, and a
`durable-service` worker also needs `methods` with both complete receiver
policies. Here `authority` is the unit manifest itself, not the
`{ panel, worker, service, methods, rationale }` envelope used by
`prepareApplication`; the explanation goes in `authorityReason`. For example, a
standalone panel with no downstream effects can request nothing:

```ts
scope.prepared = await prepareProjects([
  {
    projectType: "panel",
    name: "daily-notes",
    title: "Daily Notes",
    authority: { requests: [], provides: [] },
    authorityReason:
      "Panel-local notes with no downstream host or service effects.",
  },
]);
```

Base the requests on what the code actually does; do not copy an empty
manifest into a panel that calls workspace services. A content repository needs
no executable authority:

```ts
import { prepareProjects } from "@workspace-skills/workspace-dev";
scope.prepared = await prepareProjects([
  {
    projectType: "project",
    name: "notes",
    title: "Notes",
  },
]);
return scope.prepared;
```

| Type    | Repository      | Scaffold                                                                     |
| ------- | --------------- | ---------------------------------------------------------------------------- |
| panel   | panels/<name>   | React; an installed alternative template may be selected                     |
| worker  | workers/<name>  | Stateless by default; `agentic` or `durable-service` selects those scaffolds |
| package | packages/<name> | Reusable workspace package                                                   |
| skill   | skills/<name>   | Cross-repository skill package                                               |
| project | projects/<name> | Content-only repository                                                      |

The repository location determines the unit kind and its package scope. A
manifest cannot turn a panel into content or any other kind. Verifying the
repository path reports malformed or mismatched manifests.

Authority review covers the dependency code a unit can reach, not only its new
entry file. For example, the `agentic` worker inherits context creation,
cloning, and teardown from `AgentWorkerBase`, so even an empty subclass is not
an effect-free stateless worker. Read those lifecycle methods before choosing
its authority ceiling. Live docs search accepts capability names, and receiver
entries expose `access.authority`, including prepared leaves and resource
contracts. Assess the primary and prepared capability tiers separately.
Access to arbitrary foreign contexts needs a deliberately reviewed scope; do
not copy another worker's broad ceiling just because it builds.

For context lifecycle receivers, the prepared resource is named
`context/<encoded target context>/requester/<encoded runtime entity>` and
applies only to an existing foreign context. Creation and clone leaves are
gated; destructive teardown leaves are critical. The separate clone primary
uses the literal key `context.clone` at gated tier. A dynamic family of targets
may need a bounded prefix such as `context/`, with a rationale that honestly
covers the foreign-state operations the code can reach. Prefer a fixed set of
targets when the application can really restrict them; a scope declaration
cannot narrow code that still accepts any target. Runtime exemptions for the
same context or a freshly created target do not prove that inherited methods
acting on foreign contexts are unreachable.

In each eval call, import the functions you use and store receipts in `scope`.
`searchProjectCatalog({ resource: "icon" })` finds icons, not templates; look
in `templates/` before choosing another panel framework. To use an installed
panel scaffold, set `template: "svelte"` (or the name of the template directory
you inspected) on the same `prepareProjects` item as `authority` and
`authorityReason`. Omitting `template` selects React; the framework is never
guessed from the project name or the available templates.

## Review, verify, and publish

Preparation is a persistent edit to the context, not delivery. Customize the
candidate, then review every requested capability, resource, and tier, every
provided capability, principal, website decision, receiver effect, binding, and
notability. Remove unnecessary requests, and never widen authority just to make
verification pass.

Run `verify` on each repository path. Review the full candidate diff against
main, then publish with `vcs.publish({ message })`. The publication gate repeats the build, typecheck, and authority checks
and asks the user for approval as usual. See the [development
loop](WORKFLOW.md#development-loop) and the [VCS
skill](../vibestudio-vcs/SKILL.md). Changed code or policy needs a new review
and verification; an earlier preparation receipt does not cover it.

If a build, open, or publication fails, repair the existing candidate. Never
call either preparation API again to recover it. The connected panel path is
`scope.prepared.panel.created`; independent unit paths are
`scope.prepared[0].created`. If an edit response is lost, check VCS and the
destination paths instead of recreating blindly. Recover publication through
the typed VCS status, receipts, and retry rules; there is no scaffold-specific
helper.

## Fork existing source

`forkProject`, `forkPanel`, and `forkWorker` also prepare source in the current
context and never commit or push. Forking an executable unit requires explicit
`authority` and `authorityReason`, even for a dry run. The requested ceiling
replaces the source manifest's authority; permissions are not inherited. Check
the copied receiver contracts, resource identities, and configuration
references separately.

`forkPanel` and `forkWorker` take `from` (the existing repository path) and
`name` (the new repository's basename). `forkProject` takes explicit `from` and
`to` paths. For example:

```ts
scope.forkRequest = {
  from: "panels/daily-notes",
  name: "daily-notes-copy",
  title: "Daily Notes Copy",
  authority: { requests: [], provides: [] },
  authorityReason:
    "Panel-local notes with no downstream host or service effects.",
};
const { forkPanel } = await import("@workspace-skills/workspace-dev");
return await forkPanel({ ...scope.forkRequest, dryRun: true });
```

Check the dry-run result first; its `preparation` is null and nothing has been
edited. Then run the same request without `dryRun: true` to prepare the fork,
store the returned working-head receipt, and continue with the same review,
verification, and publication steps. Use the worker `classMap` option to rename
classes. Forking does not inherit authority and does not keep a live link to
the source.

## Test declarations

A generated starter declares a test suite only if it includes tests. The
agentic worker starter includes a native Vitest initialization test; the
minimal panel and the stateless and service-worker starters have no suites. To
add coverage, write the tests and declare their unit-local include patterns and
execution backend in `vibestudio.tests`, along with the dependencies the tests
import. Run a declared suite with `verify`; while a unit has no tests, use a
build check.
