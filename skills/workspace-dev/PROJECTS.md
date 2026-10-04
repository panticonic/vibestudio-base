# Prepare workspace projects

Workspace creation has two stages: prepare a context-local candidate, then
review, verify, commit, and publish that exact candidate through ordinary VCS.
Preparation never commits, pushes, activates code, or grants authority.
There is no one-shot creation/publication API or publication-recovery helper.

## Connected application and explicit authority

Use `prepareApplication({ name, title?, icon?, authority })` for a React panel
with a SQLite Durable Object store. It prepares `panels/<name>`,
`workers/<name>-store`, protocol `<name>.v1`, singleton key `main`, and
matching service configuration in one atomic context edit.

This is an editable connected starter, not a finished domain application or a
fixed service API. Its initial records have `id`, `title`, and timestamps;
`listRecords`/`upsertRecord` are starting methods, not the only methods your
application may implement. Complete the user's features by editing the generated
panel and worker normally: design the domain data, SQLite schema, typed RPC
methods, and UI together. For an app needing richer state, change the record
contract; do not stop because the starter lacks that state or operation.

Review authority again when extending the implementation. Every new or changed
receiver method needs its own complete literal policy (website eligibility,
principals/requirements, effect, tier, sensitivity); update unit requests and
service wiring only for the intended effects. The policy passed to preparation
does not authorize future effects automatically. Verify both provider and
consumer in the same candidate, then commit and publish the completed application,
not merely the starter. See [WORKERS.md](WORKERS.md) for durable storage and RPC
contracts and [PANEL_DEBUG_LOOP.md](PANEL_DEBUG_LOOP.md) for live verification.

The model must supply the complete `ApplicationAuthorityPolicy`:

- `rationale`: explain the data, callers, effects, scopes, and excluded authority.
- `panel` and `worker`: complete unit manifests (`requests`, `provides`, and
  any `serviceRequests`). Empty requests are an explicit decision, not a default.
- `service`: deliberate `principals`, `binding`, and `notability`.
- `methods`: complete literal receiver contracts for `listRecords` and
  `upsertRecord`, including website eligibility, principals or requirements,
  effect, tier, and sensitivity.

Preparation does not infer or add a consumer request, protocol request,
context-boundary permission, or context-clone permission. It preserves the
chosen policy; the exact build reports missing or incompatible declarations.
Treat repair suggestions as evidence to assess, not permissions to add blindly.
A rationale is review evidence, not an authorization or proof of least privilege.

This example deliberately chooses private workspace records with no downstream
host effects. Derive different policy when the real application needs it;
do not copy this envelope for credentials, sharing, egress, or destructive work:

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

The result is `{ panel, worker, service, preparation, authorityReview }`, not
an array. Each unit has `{ created, files, preflight, preparation, authorityReview }`.
`preparation` carries `contextId`, the exact returned `workingHead`,
`publication: "unchanged"`, and `liveRuntime: "unchanged"`.
The unit review contains the materialized manifest and rationale; the application
review also includes the supplied service and receiver policy. `AUTHORITY.md`
records the rationale in each executable repository. Review actual source and
manifests again after customization; this receipt is not approval of later edits.

Existing repository destinations, service names, protocols, and singleton
identities are refused, not overwritten. The service is already declared in the
candidate; use `workspace_service` only for intentional subsequent changes.

## Independent repositories

Use `prepareProjects(projects)` for standalone units or custom wiring. It
returns an array of unit receipts and never connects its repositories implicitly.
Every panel or worker requires explicit `authority` and `authorityReason`;
a `durable-service` worker additionally requires `methods` with both complete
receiver policies. Here `authority` is the unit manifest itself, not the
connected application's `{ panel, worker, service, methods, rationale }` envelope.
Keep the explanation in the separate `authorityReason` field. For example, a
standalone panel with no downstream effects can deliberately request nothing:

```ts
scope.prepared = await prepareProjects([
  {
    projectType: "panel",
    name: "daily-notes",
    title: "Daily Notes",
    authority: { requests: [], provides: [] },
    authorityReason: "Panel-local notes with no downstream host or service effects.",
  },
]);
```

Choose actual requests from the implementation's effects rather than copying an
empty manifest into a panel that calls workspace services.
A content repository needs no executable authority:

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

| Type    | Repository      | Scaffold                                                    |
| ------- | --------------- | ----------------------------------------------------------- |
| panel   | panels/<name>   | React; an installed alternative template may be selected    |
| worker  | workers/<name>  | Stateless; agentic or durable-service selects that scaffold |
| package | packages/<name> | Reusable workspace package                                  |
| skill   | skills/<name>   | Cross-repository skill package                              |
| project | projects/<name> | Content-only repository                                     |

Repository location determines unit kind and canonical package scope. A manifest
cannot change a panel into content or another kind. Malformed or mismatched
manifests fail verification on the exact repository path.

Authority review includes reachable dependency implementations, not only the
new entry file. In particular, the `agentic` worker inherits context creation,
cloning, and teardown from `AgentWorkerBase`; an empty subclass is not an
effect-free stateless worker. Inspect those lifecycle methods before deciding
its ceiling. Live docs search accepts capability names, and receiver entries
expose `access.authority`, including prepared leaves and resource contracts.
Assess the primary and prepared capability tiers separately. Dynamic foreign
context access requires a deliberately reviewed scope; do not copy another
worker's broad ceiling merely because it builds.

For context lifecycle receivers, the prepared boundary names
`context/<encoded target context>/requester/<encoded runtime entity>` and is
selected only for an existing foreign context. Creation/clone leaves are
gated; destructive teardown leaves are critical. The separate clone primary
uses literal key `context.clone` at gated tier. A dynamic family may need a
bounded prefix such as `context/`, with an honest rationale covering the
reachable foreign-state operations. Prefer a fixed target family when the
application can actually restrict it; scope declarations cannot narrow code
that still accepts arbitrary targets. Same-context/fresh-target runtime
exemptions are not proof that inherited foreign-context methods are unreachable.

Import the functions used by each eval invocation and retain receipts in
`scope`. `searchProjectCatalog({ resource: "icon" })` discovers icons, not
templates; inspect `templates/` before choosing an alternative panel framework.
Select an installed panel scaffold with `template: "svelte"` (or its inspected
template directory name) on the same `prepareProjects` item as `authority` and
`authorityReason`. Omitting `template` explicitly selects React; it does not
infer a framework from the project name or the available templates.

## Review, verify, and publish

Preparation is a durable context edit, not delivery. Customize the candidate,
review every requested capability/resource/tier, provided capability, principal,
website decision, receiver effect, binding, and notability. Remove unnecessary
requests; never widen authority merely to make verification pass.

Run `verify` with each exact repository path. Review the complete candidate
diff against main, then use normal `vcs.commit` and protected `vcs.push` with
exact-state fences. The existing publication gate repeats build/typecheck and
authority checks and performs normal user approval. See the
[development loop](WORKFLOW.md#development-loop) and
[VCS skill](../vibestudio-vcs/SKILL.md). Changed code or policy requires renewed
review and verification; a previous preparation receipt is not a seal.

On a failed build, open, or publication, repair the existing candidate. Never
call either preparation API again to recover it. Connected panel paths are
`scope.prepared.panel.created`; independent unit paths are
`scope.prepared[0].created`. A lost edit response requires observing VCS and
existing destinations, not blind recreation. Publication recovery uses ordinary
typed VCS status/receipts and retry policy, not a scaffold-specific helper.

## Fork existing source

`forkProject`, `forkPanel`, and `forkWorker` also prepare context-local source;
they never commit or push. Executable forks require explicit `authority` and
`authorityReason`, including dry runs. The requested ceiling replaces the
source manifest rather than inheriting its permissions silently. Inspect copied
receiver contracts, resource identities, and configuration references separately.

`forkPanel` and `forkWorker` take `from` (the existing repository path) and
`name` (the new repository basename). `forkProject` takes explicit `from` and
`to` paths. For example:

```ts
scope.forkRequest = {
  from: "panels/daily-notes",
  name: "daily-notes-copy",
  title: "Daily Notes Copy",
  authority: { requests: [], provides: [] },
  authorityReason: "Panel-local notes with no downstream host or service effects.",
};
const { forkPanel } = await import("@workspace-skills/workspace-dev");
return await forkPanel({ ...scope.forkRequest, dryRun: true });
```

Inspect a dry-run result first; `preparation` is null and no edit has occurred.
Run the same request without `dryRun: true` to prepare it, retain the returned
exact working-head receipt, then use the same review/verification/publication
workflow. Worker `classMap` handles deliberate class renaming. Source ancestry
does not confer authority or install a live upstream.


## Test declarations

A generated starter declares a suite only when it supplies test source. The
agentic worker starter supplies a native Vitest initialization test; minimal
panel and stateless/service-worker starters begin without test suites. To add
coverage, author the tests and declare their exact unit-local include patterns
and execution backend in `vibestudio.tests`, with the dependencies those tests
import. Run a declared suite through `verify`; use a build check while a unit
has no authored tests.
