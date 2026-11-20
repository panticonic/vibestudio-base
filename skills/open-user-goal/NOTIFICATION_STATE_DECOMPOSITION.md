# Review durable notification state

The top-level callable receives the user's outcome and chooses what can be
confirmed from one owned mailbox. It considers the evidence before and after
the assigned retained change and hands off the current state. A goal may
authorize acknowledging an exact notice if its current revision and scope still
match the user's request.

## Exact mechanism inventory

- System Testing's `notifications` skill and pinned
  `workspace-live-notification-lifecycle` capture the shell's owned temporary
  toast acceptance and dismissal. Host's `notificationService.ts` maintains
  those ephemeral IDs separately from retained account rows. Neither its push
  dispatch nor its direct inbox invalidation transport is used by these cases.
- Base's `GadWorkspaceDO` owns SQLite-backed user notification rows by account
  and notification ID. Generic producers and accepted channel membership share
  this row store. Channel membership authority, its monotonic tombstones and
  signals stay in the actual receiver. Both normal account methods and the
  synthetic fixture call the same extracted SQLite mechanism. The fixture can
  seed synthetic projections, including an invitation row, inside its own
  isolated database. This is distinct from issuing a live channel invitation.
- Desktop's `UserNotificationBar` reads the attention projection and opts
  into acknowledged history; refresh is driven by the targeted shell event
  and reconnect. Its approval observation uses ShellCore's
  `observeDurableProjection`. The known fixture boundaries exercise that
  code with deterministic obsolete, stopped or unapplied reads. The desktop
  React component and native push clients are outside the source check.
- The System Testing fixture uses its own durable-object namespace, fixed
  generated account IDs, no delivery hooks, and immutable configuration. A
  bound generation must still authorize read or exact revision acknowledgment.
  This fixture boundary provides CAS semantics based on synchronous SQLite.
  The actual account acknowledgment API remains scoped to its verified caller
  and acknowledges by ID.

## Stages

1. `locateNotificationLane` binds the user goal to the available owned scope
   and requested notice. Natlang decides how notice references and prior context
   identify a record, including when a reference stays ambiguous.
2. `readNotificationLifecycle` obtains the initial projection, asks for a fresh
   observation of the assigned retained change and reads the authorized current
   state. The typed output preserves the actual observation and scope.
3. `chooseNotificationAction` decides whether to acknowledge the exact current
   revision, leave it pending, withhold because authority changed, or request
   clarification. A nested callable evaluates the revision and history evidence.
4. `finishNotificationReview` carries out a permitted exact acknowledgment if
   requested and obtains authoritative post-action state. Natlang reports the
   effect, retained count and attention count with source evidence. The private
   verifier independently reads the fixture and checks SQLite facts against the
   declared case outcome. Capture requires the exact call arguments, values and
   receiver evidence, with hold, stale and unperformed variants checked.
