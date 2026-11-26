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

## Composition

`reviewNotificationState.nl` owns the domain work. Its focused locating,
lifecycle and decision branches retain a deeper finding lambda. Exact native
acknowledgment/readback stays in `finishNotificationReview.ts`. The model can
investigate actual changed or unavailable results without a verifier requiring
a fixed actor-call multiset.

The application value contains the actual finding, requested explanation and
any real acknowledgment. Successful acknowledgment must not discard an
explicitly requested confirmation. A known prior ID can identify a removed
record without asserting that it still exists or may be acknowledged. Only
native current scope/revision authorizes acknowledgment.

Independent fixture checks preserve native producer refresh, exact account and
revision, protected rows and requested acknowledgment effects. Bound meaning
review judges requested findings and explanations from actual actor/native
observations; private reference action/state/ID conventions are not answer
gates. Every original literal goal, ID, seed and split remains intact.
