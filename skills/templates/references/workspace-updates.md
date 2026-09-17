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
The signal and acknowledgement methods declare open effects and need no standing
grants. `extensions.invoke` resolves its receiver dynamically; it is not a
statically compilable authority-plan operation. Each concrete invocation still
passes ordinary receiver authorization. Do not invent broad grants for extension
dispatch or pre-authorize merging and publishing. `notify` owns its own effects;
it is not an eval global or an extra service operation.

`updateSignal` returns `{protocol: "automation-signal.v1", prompt: null}` when
there is nothing new to announce. That closes the run without calling a model
or posting a chat message. A nonempty prompt continues the same run into the
agent. Check failures remain failed runs, not false "up to date" results.

When woken, inspect the incoming source and compatibility, then use
`notify({to: "owner", alert: "inbox", title: "Workspace updates available", content: ...})`.
Explain what changed and ask whether to prepare the update, defer it, or
investigate further. After successful delivery, invoke `acknowledgeUpdates`
with the exact target pins supplied by the signal. This records notification for the authenticated owner,
not installation; one member's acknowledgement does not silence another member's assistant. Do not acknowledge failed delivery and do not complete the
recurring automation. Replies arrive through the ordinary durable conversation.

## Review and application

A request to monitor or review does not authorize merging into live workspace
main or installing a different app. Once the user asks to prepare an update,
inspect the installed baseline, incoming changes, local intent, and dependency
constraints. Use `prepareUpdate` with the discovered exact target for a
same-epoch review context, resume the same operation after interruption, and
use ordinary semantic VCS tools to inspect and resolve the candidate. Check
both mechanically clean changes and conflicts. Run focused validation and
present the concrete result before requesting approval to publish.

## Compatibility

`meta/vibestudio.yml` declares `systemEpoch`, exactly the workspace host's
SemVer major version. It is not a minimum app version or a semver range.
Minor/patch compatibility within that epoch is a release contract; epoch 0
remains explicitly unstable. The installed desktop/hub and a workspace child
may run different generations.

A foreign source epoch is discoverable through the stable envelope read even
when its future manifest schema cannot be parsed by the running host. Do not
rewrite an epoch or bypass active admission. Same-epoch `prepareUpdate` is not
a cross-epoch migration API.

For a generation crossing, explain both prerequisites: an available matching
host and a userland-prepared workspace candidate. The hub selects the child's
host from its durable launch record; `vcs.push` with `epochTransition: true`
is the reviewed handoff for a prepared candidate. Old workspaces can keep
using a retained old host after the app is updated. This is best-effort and
requires that retained host to exist. If the exact target host or a supported
composition path is unavailable, report that blocker before modifying live
main. Installing the newest app alone does not migrate workspace content.

## Workspace-authored defaults

`defaultAutomations` is a record keyed by stable IDs. Each value supplies
`source` and `className` for the agent, plus `name`, `summary`, `action`,
`trigger`, and `operations` in the ordinary automation vocabulary. Definitions
inherit by ID through template composition. A null value suppresses an inherited
default for future provisioning. For example, `workspace-updates: null` opts a
workspace out of that default; it does not retire an existing user's automation.

The declaration supplies initial settings, not ongoing enforced policy. The
installed automation owns subsequent user changes. Changing a template's default
never resets a saved schedule or re-enables a paused or retired automation.
Keep the ID stable when changing defaults; a new ID represents another automation.
Review and apply changes to existing automations explicitly with the user.
