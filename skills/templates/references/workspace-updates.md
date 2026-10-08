# Workspace update assistant

The normal update workflow is agentic. The UI discovers sources and opens a
review conversation; it does not make semantic merge decisions. A clean VCS
merge still needs an agent to inspect intent, behavior, and relevant tests.

## Monitoring without a mounted chat panel

Base declares `defaultAutomations.workspace-updates` in `meta/vibestudio.yml`.
The workspace host provisions it automatically for each member, without a
chat panel or model call. Personal and System inherit the same declaration.

Read `templates.updateAssistant()` to find the actual installed automation.
Reconfigure that record through ordinary Automations edit/pause/resume controls;
never launch a duplicate to change a schedule. Paused and retired choices
survive restarts. A missing record means provisioning has not completed, not
that monitoring is active. Inspect runtime/build errors before offering repair.

For an explicitly requested custom automation, use the native
`launch_automation` tool with a `watch` action. The missions
service owns the schedule, durable run, retries, and authority. Never install
an extension timer or a second queue for updates. The agent and conversation
are durable; a mounted chat panel is not required.

Inspect owner-visible automations before creating a duplicate. Default product
setup is one continuing conversation per member and workspace, every six hours. Honor a
user's different cadence or routing preference.

The watch code is:

```ts
import { extensions } from "@workspace/runtime";
return await extensions.invoke("@workspace-extensions/templates", "updateSignal", []);
```

Launch with `action: { kind: "watch", code: <the code above>, syntax: "typescript" }`,
`trigger: { kind: "schedule", everyMs: 21_600_000 }`, and
`conversation: { mode: "continue" }`, with `operations: []`.
The signal method invokes the manifest-declared workspace inbox service; receiver authorization remains in force. `extensions.invoke` resolves its receiver dynamically; it is not a
statically compilable authority-plan operation. Each concrete invocation still
passes ordinary receiver authorization. Do not invent broad grants for extension
dispatch or pre-authorize merging and publishing. `notify` owns its own effects;
it is not an eval global or an extra service operation.

`updateSignal` checks exact upstream targets and writes a durable, owner-scoped
inbox notice when something new is available. It returns
`{protocol: "automation-signal.v1", prompt: null}` after delivery, without a
model call. The notice's **Review and merge with an agent** action opens an
ordinary chat with the exact incoming targets and compatibility requirements.
The agent starts only when the user takes that action.

Failed checks and failed inbox delivery remain failed runs. Delivery records
freeze the notice before sending, so an interrupted invocation retries the
same notice rather than consuming it or creating a duplicate. A workspace has
one current notice per member: parent changes cover their dependencies, and
the agent receives all exact targets as one coherent review request. Successful
discovery replaces superseded targets. Protected-main changes remove stale
notices without a network check; failed discovery preserves the last valid
notice. Each member has
their own notification obligation. The same target becomes announceable again
when the app version changes, because it may now be compatible.

On a surrounding app version change, workspace lifecycle wakes an existing
active default watch whose declaration subscribes with `events: [app-update]`
through the ordinary durable automation run. Unrelated default watches are not
run. Each version-change occurrence gets a durable command identity, including
downgrade/reupgrade cycles. It preserves
saved schedules and does not resume paused or retired automations. Initial
provisioning records the current app version without starting an agent or run.
The new Base implementation declares a 0.1.84 minimum; released 0.1.83 lacks
its new APIs. Monitoring requires the installed workspace's update-assistant code; updating
the app does not replace that user-owned code.

## Review and application

A request to monitor or review does not authorize merging into live workspace
main or installing a different app. Once the user asks to prepare an update,
inspect the installed baseline, incoming changes, local intent, and dependency
constraints. A selected parent update resolves its incoming dependency closure
once; authored exact pins remain constraints. Other installed source selections
remain fixed. Use `prepareUpdate` with the discovered exact parent target for a
review context, resume the same operation after interruption, and
use ordinary semantic VCS tools to inspect and resolve the candidate. Check
both mechanically clean changes and conflicts. Run focused validation and
present the concrete result before requesting approval to publish.

## Compatibility

`meta/vibestudio.yml` declares `systemEpoch`, exactly the workspace host's
SemVer major version. It is not a minimum app version or a semver range.
An optional top-level `minimumAppVersion` is an exact SemVer release in that
same generation, for example `minimumAppVersion: 0.1.84`. Omission declares no
additional minor/patch floor. Composition retains the strongest floor across
all installed layers; a dependent or locally authored layer cannot lower a
dependency's requirement. Exact-source preparation, active admission and
protected publication and hub host selection enforce it. The stable envelope
walks the installed dependency declarations as well as the top-level requirement,
so a generation handoff cannot omit an inherited floor. Discovery remains available on an older
host and flags the required app update before merging. Epoch 0
remains explicitly unstable. The installed desktop/hub and a workspace child
may run different generations.

A foreign source epoch is discoverable through the stable envelope read even
when its future manifest schema cannot be parsed by the running host. Do not
rewrite an epoch or bypass active admission. Preparation composes source against the selected root generation and enforces
the strongest minimum version against its available matching host. It does
not admit that source into the old running host. Unsupported future manifest
schemas remain a concrete blocker.

For a generation crossing, explain both prerequisites: an available matching
host and a userland-prepared workspace candidate. The hub selects the child's
host from its durable launch record; `vcs.push` with `epochTransition: true`
is the reviewed handoff for a prepared candidate. Old workspaces can keep
using a retained old host after the app is updated. This is best-effort and
requires that retained host to exist. The update view shows the workspace host
and installed app versions when they differ. A missing matching host is shown
as “Compatible host unavailable”, separately from “App update required”; the
same agent review action can explain the blocker and plan recovery. Retained
children load artifacts, internal-agent bundles and build tools from their
retained installation rather than inheriting the newer hub’s binaries. If the exact target host or a supported
source composition is unavailable, report that blocker before modifying live
main. Installing the newest app alone does not migrate workspace content.

## Workspace-authored defaults

`defaultAutomations` is a record keyed by stable IDs. Each value supplies
`source` and `className` for the agent, plus `name`, `summary`, `action`,
`trigger`, optional lifecycle `events`, and `operations` in the ordinary automation vocabulary. Definitions
inherit by ID through template composition. A null value suppresses an inherited
default for future provisioning. For example, `workspace-updates: null` opts a
workspace out of that default; it does not retire an existing user's automation.

The action, trigger, name, summary, and operations supply initial settings,
not ongoing enforced policy. Optional `events: [app-update]` explicitly
subscribes that default watch to workspace lifecycle wakeups; remove the
subscription to stop those wakeups. It does not replace the saved charter. The
installed automation owns subsequent user changes. Changing a template's default
never resets a saved schedule or re-enables a paused or retired automation.
Keep the ID stable when changing defaults; a new ID represents another automation.
Review and apply changes to existing automations explicitly with the user.
