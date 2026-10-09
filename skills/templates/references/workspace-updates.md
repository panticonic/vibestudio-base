# Workspace update assistant

An agent reviews updates. The UI finds sources and opens a review
conversation but makes no merge decisions; even a clean VCS merge needs an
agent to check intent, behavior, and relevant tests.

## Monitoring without a mounted chat panel

Base declares `defaultAutomations.workspace-updates` in `meta/vibestudio.yml`,
and Personal and System inherit it. The workspace host provisions it for each
member automatically, with no chat panel or model call.

`templates.updateAssistant()` returns the installed automation. Change it with
the Automations edit/pause/resume controls; don't launch a duplicate to change
the schedule. Paused and retired states survive restarts. A missing record
means provisioning hasn't finished, not that monitoring is running; check
runtime and build errors before offering a fix.

For an explicitly requested custom automation, use the native
`launch_automation` tool with a `watch` action. The missions service owns the
schedule, durable run, retries, and authority; never add an extension timer or
a second update queue. The agent and conversation are durable, so no mounted
chat panel is needed. Check the owner's existing automations first to avoid
duplicates. The default is one continuing conversation per member and
workspace, every six hours; follow the user's preferred cadence or routing if
different.

The watch code is:

```ts
import { extensions } from "@workspace/runtime";
return await extensions.invoke(
  "@workspace-extensions/templates",
  "updateSignal",
  [],
);
```

Launch with
`action: { kind: "watch", code: <the code above>, syntax: "typescript" }`,
`trigger: { kind: "schedule", everyMs: 21_600_000 }`,
`conversation: { mode: "continue" }`, and `operations: []`.

`updateSignal` calls the manifest-declared workspace inbox service, subject to
receiver authorization. Because `extensions.invoke` resolves its receiver at
runtime, it can't be compiled statically into an authority plan; each call
still passes receiver authorization. Don't add broad grants for extension
dispatch or pre-authorize merging and publishing. `notify` handles its own
effects; it isn't an eval global or extra service operation.

`updateSignal` checks the upstream targets and, when something new is
available, writes a durable owner-scoped inbox notice. After delivery it
returns `{protocol: "automation-signal.v1", prompt: null}` without a model
call. The notice's **Review and merge with an agent** action opens a chat with
the incoming targets and compatibility requirements; the agent starts only
when the user takes it.

- Failed checks and failed deliveries are failed runs.
- A delivery record captures the notice before sending, so an interrupted run
  retries the same notice instead of losing or duplicating it.
- Each member has one current notice per workspace. Parent updates cover their
  dependencies, and the agent gets all targets as one review request.
- A successful check replaces outdated targets. A protected-main change
  removes stale notices without a network check. A failed check keeps the last
  valid notice.
- Each member is notified separately.
- A target becomes announceable again when the app version changes, since it
  may now be compatible.

When the app version changes, the workspace lifecycle wakes each active
default watch that subscribes with `events: [app-update]`, as a normal durable
automation run; other default watches don't run. Each version change,
including downgrade and re-upgrade, gets its own durable command ID. Saved
schedules are kept and paused or retired automations stay so. Initial
provisioning records the current app version without starting an agent or
run.

The current Base implementation requires app 0.1.84; 0.1.83 lacks its new
APIs. Monitoring runs the update-assistant code installed in the workspace,
which updating the app doesn't replace.

## Review and application

Asking to monitor or review doesn't authorize merging into live workspace
main or installing a different app. Once the user asks to prepare an update:

1. Inspect the installed baseline, incoming changes, local intent, and
   dependency constraints. A selected parent update resolves its incoming
   dependencies once; pins the author set remain constraints, and other
   installed source selections stay fixed.
2. Call `prepareUpdate` with the discovered parent target to get a review
   context; after an interruption, resume the same operation.
3. Inspect and resolve the candidate with the semantic VCS tools, covering
   both clean changes and conflicts.
4. Run focused validation and show the result before asking for approval to
   publish.

## Compatibility

`meta/vibestudio.yml` declares `systemEpoch`, which equals the workspace
host's SemVer major version. It is not a minimum app version or a range.
Epoch 0 is explicitly unstable.

An optional top-level `minimumAppVersion` is an exact SemVer release in the
same major version, e.g. `minimumAppVersion: 0.1.84`; without it there is no
extra minor/patch minimum. Composition keeps the highest minimum across all
installed layers, so a dependent or local layer can't lower a dependency's
requirement. Source preparation, active admission, protected publication, and
the hub's host selection all enforce it. The stable envelope includes
installed dependency declarations as well as the top-level requirement, so a
major-version handoff can't drop an inherited minimum. On an older host,
discovery still works and reports the required app update before merging.

The desktop/hub and a workspace's child host may run different major
versions. A source with a newer epoch is still discoverable through the stable
envelope even if the running host can't parse its manifest schema. Don't
rewrite an epoch or bypass active admission. Preparation composes the source
for the selected root's major version and enforces the highest minimum
against an available matching host; it doesn't admit that source into the old
running host. An unsupported future manifest schema is a real blocker.

Crossing a major version needs two things, so explain both: an available
matching host and a userland-prepared workspace candidate. The hub picks the
child's host from its durable launch record, and `vcs.push` with
`epochTransition: true` is the reviewed handoff for a prepared candidate.

After the app updates, old workspaces can keep running on a retained old host,
on a best-effort basis and only if that host still exists. Retained children
load artifacts, internal-agent bundles, and build tools from their own
installation, not the newer hub. The update view shows the workspace host and
app versions when they differ. A missing matching host appears as "Compatible
host unavailable", separate from "App update required", and the same agent
review action can explain it and plan recovery. If the target host or a
supported source composition is unavailable, report that before modifying
live main. Installing the newest app doesn't migrate workspace content.

## Workspace-authored defaults

`defaultAutomations` is a record keyed by stable IDs. Each value supplies the
agent's `source` and `className`, plus `name`, `summary`, `action`,
`trigger`, optional lifecycle `events`, and `operations`, in the normal
automation vocabulary. Definitions inherit by ID through template
composition. A `null` value suppresses an inherited default for future
provisioning: `workspace-updates: null` opts a workspace out but doesn't
retire an automation a user already has.

`action`, `trigger`, `name`, `summary`, and `operations` are initial settings,
not ongoing policy. `events: [app-update]` subscribes the default watch to
lifecycle wakeups; remove it to stop them. It doesn't replace the saved
charter. Once installed, the automation owns the user's changes, and changing
a template's default never resets a saved schedule or re-enables a paused or
retired automation. Keep IDs stable; a new ID is a different automation.
Review and apply changes to existing automations explicitly with the user.
