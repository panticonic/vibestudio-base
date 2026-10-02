# Mission Control product finish checklist

This pass covers the complete native panel, with real persisted planning state and the platform’s canonical execution ledger. A checked item has been implemented and reviewed; verification details belong in the PR/commit evidence.

## Capture and planning
- [x] Inline quick capture into the current project or a chosen project.
- [x] Research, build, bug and review brief templates.
- [x] Editable acceptance checklist, card progress, and inline completion.
- [x] Persisted task notes and chronological card activity.
- [x] Duplicate a planning card without copying execution or history.
- [x] View dependency titles, completion and blockers; navigate to dependency cards.
- [x] Undo the last single-card planning edit with optimistic revision checks.
- [x] Explicit accept-delivery and reopen actions.
- [x] Due-date shortcuts and overdue/today labels.

## Navigation and organization
- [x] Board, selectable list and due-date agenda views.
- [x] Drag cards between status columns, with accessible status controls.
- [x] Clear search, removable filter chips and reset.
- [x] Due, execution-link and dependency-blocked filters.
- [x] Category/tag suggestions from the complete project scope.
- [x] Direct sort control, counts and pagination-aware selection.
- [x] Bulk status, priority, project and tag changes with honest partial failures.
- [x] Rename, replace and remove saved views.
- [x] Export all filtered planning cards as CSV through existing overview pagination.
- [x] Keyboard shortcuts, discoverable help and command search.

## Projects and forms
- [x] Repository search, selected chips, select matches, clear and explicit retry.
- [x] Project settings and archive/restore with clear lifecycle constraints.
- [x] Consistent labels, limits, required fields and actionable validation.
- [x] Prevent accidental loss of edited forms and restore focus on close.
- [x] Cmd/Ctrl+Enter submission and usable mobile form layouts.
- [x] Recurring daily, weekdays, weekly and interval presets plus advanced cron.
- [x] Timezone validation, finite schedule limits and readable recurrence summaries.

## Execution and inspection
- [x] Independent agent launches keep planning usable while approvals are unresolved.
- [x] Clear card actions and honest agent/run state.
- [x] Accessible task inspector with priority, due date, tags, checklist and dependencies.
- [x] Readable run outcome, exact chat link, summary expansion and copy.
- [x] Presentation preference retains canonical conversation history.
- [x] Cancellation confirmation explains interruption and joined completion.
- [x] Schedule pause/resume and previous run failures remain visible and actionable.

## Visual and interaction finish
- [x] Readable density, useful metadata and deliberate spacing in light and dark themes.
- [x] Visible keyboard focus and accessible control names/states.
- [x] Responsive board, sidebar, inspector and dialog layouts.
- [x] Reduced-motion support and restrained hover/transition polish.
- [x] Initial loading, refreshing, empty filtered views, errors and success feedback.
- [x] No fake cards, manufactured progress, disappearing approvals or timeouts.

## Verification

The native walkthrough covers real project/repository association, checklist and notes, task execution through review, the exact run chat, planning during an unresolved launch, agenda and saved due filters, weekday automation in Europe/Berlin, pause, acceptance, duplication, cancellation, keyboard commands, draft protection, and desktop/mobile renders. Focused interaction, schema, activity, concurrency and lifecycle tests supplement that walkthrough. Full Base composition typechecks and template checkout hygiene pass.

Light-theme styles use the native Radix theme tokens and were reviewed alongside dark-theme styles. The current unattended Chromium host exposes no supported appearance-setting operation, so this final walkthrough visually verifies dark mode; light appearance follows the normal hosting app’s Theme Settings.
