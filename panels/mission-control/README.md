# Mission Control

Open `panels/mission-control` from the workspace launcher. The panel starts with
real empty states; projects and cards are persisted by the workspace's
`mission-control.v1` service.

Create a project and select any combination of real workspace repositories.
Capture tasks with briefs, priorities, categories, tags, due dates and
dependencies and acceptance checklists. Capture small ideas inline; use research,
build, bug and review outlines for a richer brief. Duplicate a plan to reuse it
without copying execution history. Notes and card activity persist independently
of conversations.

Use the board, selectable list, due-date agenda, search, status/priority filters,
due and execution filters, dependency blockers, and saved views to choose what matters. Drag cards between columns, use their accessible
status selector, or select several cards for a bulk status, priority, project or tag change. Undo the last single-card planning
edit with the same revision checks; a concurrent edit can invalidate that undo.
Export CSV walks the complete filtered view through pagination. Accepted work belongs
in Done; executor completion alone does not establish acceptance.

Start an agent from a task or configure an interval/calendar automation. Each
task has one stable automation identity, and its sessions come directly from
the existing automation run ledger. Recurring runs use isolated conversations
and read the current task brief and repository associations at run start.
The automation scheduler owns overlap prevention, cadence, permission
acquisition, completion, and failures. Pausing stops future ticks; cancelling
stops and joins admitted work before the card becomes Cancelled.

The session inspector keeps concise outcomes in focus and can expose links to
the exact conversation. Overview mode is a presentation preference: it does
not delete conversations or copy transcripts into the task database.

Talk to Mission lead to turn flowing ideas into tasks, survey work, organize
cards, change the board's shared view, and manage execution. Mission lead uses
the ordinary chat vessel with one app-shaped `mission_control` tool. Independent task launches, conversations and schedule commands keep planning
usable while approvals are unresolved. Pending operations remain visible until
their own completion or original failure.

Human edits and agent edits use the same optimistic revision checks.

Projects can be archived and restored without deleting their tasks or history.
Running work and enabled recurring schedules must first be stopped. Repository
selections describe intended scope; they do not grant or restrict security
authority. All executions use normal workspace approvals and VCS publication.

Forms preserve unsaved changes, show actionable field errors, support repository
search/recovery, and offer calendar/interval presets through the canonical
scheduler. Closing a task inspector or dialog restores keyboard focus. Single-key
shortcuts do not interrupt typing: **N** creates a task, **P** creates a project,
**/** focuses search, **?** opens help, and **Ctrl/⌘ K** opens command search.
Use **Ctrl/⌘ Enter** to save a form. The panel supports light/dark themes, reduced
motion, and responsive navigation, boards, inspectors and dialogs.

The [product finish checklist](./POLISH.md) records this component pass.

## Verification from the host checkout

```sh
pnpm test:userland -- --template base \
  --filter packages/mission-control/index.test.ts \
  --filter workers/mission-control-store/index.test.ts \
  --filter workers/mission-agent/index.test.ts \
  --filter panels/mission-control/index.test.tsx \
  --filter panels/mission-control/forms.test.tsx \
  --filter workers/missions/MissionsDO.test.ts
pnpm type-check:userland -- --template base
pnpm check:template-checkout-hygiene
```

Never run package-manager or build commands in the external template checkout.
