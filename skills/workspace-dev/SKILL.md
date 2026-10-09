---
name: workspace-dev
description: Prepare, fork, develop, verify, and diagnose workspace panels, workers, Durable Objects, packages, external dependency policy, and repo-local skills.
---

# Workspace development

Every panel, worker, agent, and context in a workspace runs from that
workspace's materialized source and state. A context is a branch inside the
workspace; it cannot load source from another workspace. Quickfire runs in the
workspace of its target panel. Personal and System are private per-user
workspaces. Native client code comes from the user's System workspace, while
`about/new` and other workspace-local pages load locally.

To integrate with another workspace, make a normal RPC call with an explicit
destination; this does not load that workspace's source. The receiving method
must be exposed for cross-workspace use, and both the source's outgoing policy
and the destination's incoming policy must allow the call before operation
authority is checked. See [RPC.md](RPC.md). Do not build a separate forwarding
channel.

Use the System workspace's `skills/appdev/SKILL.md` for trusted apps and
[extension development](../extensiondev/SKILL.md) for trusted Node services.

## Read by task

| Task                                                           | Reference                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Add a workspace from a folder, Git URL, or website link        | [Workspace creation](../templates/references/workspace-creation.md)  |
| Publish a standalone workspace source                          | [Workspace authoring](../templates/references/template-authoring.md) |
| Create a new panel, worker, package, or repo-local skill       | [Scaffold projects](PROJECTS.md)                                     |
| Fork an existing panel or worker source                        | [Fork projects](PROJECTS.md#fork-existing-source)                    |
| Development loop                                               | [WORKFLOW.md](WORKFLOW.md)                                           |
| External dependencies, overrides, and patches                  | [DEPENDENCIES.md](DEPENDENCIES.md)                                   |
| Build, inspect, polish a panel                                 | [PANEL_DEBUG_LOOP.md](PANEL_DEBUG_LOOP.md)                           |
| Reduce bundle size or optimize runtime cost                    | System workspace: `skills/performance/SKILL.md`                      |
| Panel lifecycle, observation, failure diagnosis, host commands | [PANEL_API.md](PANEL_API.md)                                         |
| Workers, DOs, service-backed data, agent workers               | [WORKERS.md](WORKERS.md)                                             |
| Build a workspace-enabled website                              | [WEBSITES.md](WEBSITES.md)                                           |
| Package or publish a panel website                             | [website publishing](../website-publishing/SKILL.md)                 |
| Typed parent-child contracts                                   | [RPC.md](RPC.md)                                                     |
| CDP/browser automation                                         | [BROWSER.md](BROWSER.md)                                             |
| Agent tool recipes                                             | [TOOLS.md](TOOLS.md)                                                 |
| Current workspace, unit status, logs, and release history      | [sandbox runtime API](../sandbox/RUNTIME_API.md#current-workspace)   |
| Icons and unit identity                                        | [references/icons.md](references/icons.md)                           |

Also read [capabilities](../capabilities/SKILL.md) before adding authority, the
System workspace's `skills/performance/SKILL.md` before changing startup cost,
and [Vibestudio VCS](../vibestudio-vcs/SKILL.md) before managed-source
operations.

## Diagnose panel loading first

For a panel that is preparing, blank, failed, or stuck, start with [PANEL_API
diagnostics](PANEL_API.md#diagnostics). Reuse the existing handle, call its
read-only `observe()`, then call `diagnose()` once. The returned packet contains
the active attempt, phase, failure, host state, console history, and build
provenance.

Escalate only when that evidence points further: supervision of the specific
runtime entity, a build report for the specific source and ref, or server logs
when the packet places the failure below the panel lifecycle. Do not rebuild,
reload, open a duplicate, enter VCS, or read test sources just to find out which
layer failed. Profile performance only after the panel lifecycle is healthy.

## Repo-local skills

Put implementation-specific guidance next to its code as `<repo>/SKILL.md`
(e.g. `packages/foo/SKILL.md`). Use `skills/<name>` only for cross-repository
workflows or reusable skill packages. A repo-local skill explains purpose,
workflow, ownership, invariants, and diagnostics. Leave method lists, generated
schemas, and volatile constants to live docs or code.

## Core rules

- For a new persistent application, write a complete authority policy and call
  `prepareApplication({ name, title, authority })` from
  `@workspace-skills/workspace-dev`. It prepares the connected code and config
  in the current context. It does not add requests, commit, publish, or grant
  access. Its record methods are editable starter code, not a limit on the
  app's features: extend the data, receiver contracts and policies, and UI to
  finish the requested application. Review the resulting authority envelope,
  verify the candidate paths, then commit and push explicitly. See
  [PROJECTS.md](PROJECTS.md).
- Build for real use. Workspace units are long-lived infrastructure, not
  prototypes: persist state properly, keep schemas current, surface errors,
  request only justified authority, and test edge cases. Do not fill
  applications with hardcoded demo or fake data; build real empty states,
  data-entry flows, and persistence.
- Use workspace-root-relative paths. Never put host checkout paths in workspace
  source or tool arguments.
- A repository's location determines its unit kind. A repository under
  `panels/`, `workers/`, `apps/`, `extensions/`, `packages/`, or `skills/` must
  match that kind and its package scope; manifests configure the kind but never
  choose it. Verify the repository path to get manifest, source, type, build,
  and authority diagnostics in one report.
- A workspace's `admin`/`member` membership role is separate from the
  authenticated account's `accountRole`. Personal and System stay private
  regardless of workspace membership APIs.
- Declare every package you import, in the right field. A unit loaded on its
  own (panel, about page, app, worker, extension) puts React and its UI kit in
  `dependencies`. A unit loaded into another unit's realm (skill, package) puts
  them in `peerDependencies` so it uses the realm's live instances. Nothing is
  installed for you. See [external dependency
  resolution](DEPENDENCIES.md#own-it-or-let-the-realm-provide-it).
- Use the structured read/edit/write/move/copy tools and semantic VCS tools for
  managed files. Use eval for runtime operations, not as a file editor or
  shell.
- Use `verify` for build checks and focused tests in a specific context.
  `build.getBuildReport` combines bundling, TypeScript, and static authority
  diagnostics for an executable unit; see [the development
  loop](WORKFLOW.md#semantic-workspace-development). Builds enforce strict types
  and checked indexed access even if a local `tsconfig.json` relaxes them, so
  array, record, and string indexing can produce `undefined`; check the value in
  source before using it. Each diagnostic keeps its file, range, and
  `compilerCode`. When repairing a candidate, read the whole diagnostic list:
  independent errors can appear alongside the consequences of the primary
  defect.
- Declare every in-app test suite in `package.json#vibestudio.tests` and choose
  its runtime to match production: `browser` for panels and DOM behavior,
  `workerd` for workers and portable logic, and `native` only for Node,
  Electron, extension, filesystem, socket, or process behavior. The runtime is
  part of reviewed source and never falls back to native.
- Before adding a test to an existing unit, read its declared suite and put the
  test in a file matched by the suite's `include` patterns. Test code added to
  a production entry point is not a selected test file.
- Browser and workerd suite files import test primitives from
  `@workspace/test-runtime`, which must be a declared `workspace:*` production
  dependency. Test artifacts are built from the unit's executable dependencies,
  so `devDependencies` are not available in the sandboxed realm. Native suites
  may use Vitest. When a unit has several suites, pass `suite` to `verify`;
  `file` is relative to the unit and must belong to that suite.
- Browser verification opens the visible `about/testbench` panel and launches
  the sealed test artifact as a visible child panel. The child gets the full
  production panel runtime, including the real document, RPC, and the normal
  `fs`/`path` build shims. Workerd suites likewise run as complete disposable
  worker entities with normal workerd compatibility. An interactive client
  displays the child; otherwise the managed headless client hosts it. A hosting
  failure is an infrastructure problem, never a reason to move the code to
  Node. Tests reach the runtime through imports from `@workspace/runtime`, as
  production panel code does; for example, assert that
  `document.documentElement` exists and that the imported `rpc.call` is a
  function. Runtime bindings are module exports; do not rely on undocumented
  window properties.
- In eval, use the ambient `scope`, `scopes`, `db`, `ctx`, `help`, `chat`, and
  `agent` directly. Portable runtime bindings can also be imported from
  `@workspace/runtime`; see [sandbox eval](../sandbox/EVAL.md).
- Eval is not transactional: store receipts from mutating calls in `scope`
  before awaiting a later step.
- Reuse handles, bind temporary panels with `await using` so they are archived
  on exit, and close temporary pages, workers, and diagnostics. Handles kept in eval `scope` survive a kernel restart.
- Give every executable unit one manifest icon: a single emoji or a
  unit-relative image path. Catalog IDs are authoring inputs only; pass them to
  scaffolding or `setUnitIcon` and never write them into the manifest. Use
  `prepareUnitIcon` when preparing a complete unit by hand. Follow the [shared
  guide](references/icons.md) and use `@workspace/ui/icons` for controls.
- Inspect accessible roles and names before automating. Repeated item controls
  need item-specific accessible names; do not pick them by position.
- Follow the host's live light/dark setting. Automatically mounted React panels
  already have a Radix theme wrapper; use its theme-aware colors in custom CSS
  instead of hardcoding a light or dark palette. Read [theme and
  layout](WORKFLOW.md#theme-and-layout) when building UI, and check both
  appearances plus live switching. Keep layouts usable at narrow mobile widths.

## Creative imagery and visual assets

Use `imagegen` without being asked when original imagery would make the work
better: illustrations for stories and learning material, game sprites and
scenery, textures, concept art, editorial images, and visual explanations. This
covers project content as well as interfaces. Give each image a purpose in the
finished work and keep to the user's chosen style and scope.

In `prompt`, describe the subject, composition, visual style, and intended use.
Save reusable assets with `outputPath` inside the target repository; put
exploratory variants in `.tmp/`. The tool uses the connected OpenAI Codex
subscription and records binary writes through semantic VCS. Its live schema
documents size, quality, background, and output format options.

Look at the returned image, or `read` it, before deciding it is ready. To refine
an image, pass its workspace path in `referencePaths` and describe what should
change and what should stay the same. Prefer a new output path for variants; to
replace a file on purpose, pass `createOnly: false`, which keeps the usual
conflict check against the observed file. Check the chosen asset in its real
layout or content, including cropping, scale, and theme, and share it with
`notify` attachments. Keep exact text, data plots, and structural diagrams in
editable code or vector form when their content must be precise, and keep using
the shared icon system for UI controls and unit identity.

## Persistence and programmable surfaces

Assume an application that creates or changes user data needs persistent
storage unless the user says the data is disposable. Use Durable Object SQLite
for transactional shared application state. Use version-controlled files under
`projects/` for content that benefits from history, diffs, and collaboration.
Panel state args, eval scope, component state, and process memory are for
presentation or scratch state; they must not be the only copy of meaningful
application data.

For a panel or app backed by a workspace service, define and verify the service
contract before building the UI.

For a new persistent app, `prepareApplication` requires explicit unit
manifests, a service policy, complete literal receiver contracts, and a
rationale. It writes the code and configuration but does not infer requests,
principals, binding, notability, or exposure. The steps below review and
customize that candidate; do not register its service a second time. For
existing or custom units, write the declarations in each unit's own manifest
and source.

1. Read [the service-backed data workflow](WORKERS.md#durable-object-backed-app-databases).
2. Define and verify the provider's real `@rpc` methods and its service
   declaration. Do not invent placeholder method names. `workspace_service`
   requires an explicit `binding`: `consent` asks each caller for access,
   `declared` makes the reviewed wiring available to the listed principals, and
   `{ declaredFor: ["panels/my-app"] }` limits that wiring to the named
   consumers. Pick the policy the application needs; receiver method authority
   is separate from the binding.
3. Add the consumer's `authority.serviceRequests` declaration in the same
   change.
4. In the consumer, narrow the result of `workers.resolveService(...)` by
   `kind` before using kind-specific fields such as `targetId` or
   `routeBasePath`.
5. Verify the provider, then a minimal consumer call, before building out the
   UI. With `declaredFor`, make that call from a named installed consumer,
   through its UI or its own app-specific RPC. Code imported into eval keeps the
   eval caller's identity and does not get the consumer's binding. Other callers
   need consent; do not widen the binding just to make a test call work.

For an existing declared service, `verify` only checks the context candidate. A
green `verify` never updates the running service build. Before a live call can
use a new or changed RPC method, commit the provider edits, publish its
repository, wait for publication to finish, then resolve the service again and
call the method.

Expose application operations as narrow, app-specific RPC methods with explicit
receiver contracts. Use channels and structured events when collaboration is
part of the product. Keep UI-only view methods out of the domain API.

## Scaffold projects

Read [PROJECTS.md](PROJECTS.md) for workspace scaffolding, supported project
types, preparation receipts, and build verification.

## Open and verify panels

`openPanel(source, options)` waits for the boot handshake of the runtime
attempt it selected. `createPanelSlot` only returns the panel's place in the
tree. Neither a slot nor boot readiness proves that the UI renders correctly.

A panel's code builds from its own context unless `ref` names other code.
Without `contextId`, the panel gets a new context forked from the verified
caller's working state, so code written there can be opened directly; pass
`contextId` to share a context and see its later edits on rebuild. Root host
callers have no context and get main. After opening or rebuilding, return the
observation and a structured snapshot from the same handle. Keep the handle and
its stable panel ID together in scope.

Use `PANEL_DEBUG_LOOP.md` for authoring and polish. For actions in the host
chrome, follow [host commands](PANEL_API.md#host-commands): the panel defines
what a command means and runs it; desktop and mobile hosts decide how it is
presented and routed.

## Development and runtime provenance

Author from the current working head, run focused checks, commit the complete
local application chain, and publish explicitly. Work that needs its own commit
belongs in another context.

Workers and DOs normally run the code of the context they belong to. Panels
need an explicit context ref to run unpublished source. If a change seems
missing, check the current VCS relation, requested and effective ref, build
key, runtime identity, and rebuild observation before editing again. Do not
infer the revision from uncommitted files or from the fact that a renderer
exists.

Panel lifecycle APIs and semantic checks work in headless eval, but visual
presentation and CDP need an available host. Choosing and creating workspaces
from the catalog happens in the human shell's hub session, not in workspace
eval.
