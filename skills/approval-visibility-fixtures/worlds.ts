import type {
  ApprovalCaller,
  ApprovalQueueReceipt,
  ApprovalSurface,
  ApprovalSurfaceReview,
  ApprovalVisibilityReport,
} from "../capabilities/natlang/types.js";

const view = (
  source: ApprovalSurface,
  ...ids: string[]
): ApprovalSurfaceReview => ({ source, state: "visible", ids });
const waiting = (source: ApprovalSurface): ApprovalSurfaceReview => ({
  source,
  state: "awaiting-snapshot",
  ids: [],
});
const unavailable = (source: ApprovalSurface): ApprovalSurfaceReview => ({
  source,
  state: "unavailable",
  ids: [],
});
const snapshot = (
  source: ApprovalSurface,
  ...ids: string[]
): ApprovalQueueReceipt => ({ source, kind: "snapshot", ids });
const ack = (source: ApprovalSurface): ApprovalQueueReceipt => ({
  source,
  kind: "acknowledged",
  ids: [],
});
const lost = (source: ApprovalSurface): ApprovalQueueReceipt => ({
  source,
  kind: "unavailable",
  ids: [],
});

function world(
  id: string,
  goal: string,
  caller: ApprovalCaller,
  approvalId: string | null,
  receipts: ApprovalQueueReceipt[],
  coverage: ApprovalVisibilityReport["coverage"],
  surfaces: ApprovalSurfaceReview[],
  status: ApprovalVisibilityReport["location"]["status"],
  source: ApprovalSurface | null = null,
) {
  return {
    id: `approval-queue-${id}`,
    sourceGroup: "vibestudio:cli:approval-queue-visibility",
    request: { goal, caller, approvalId, receipts },
    expected: {
      coverage,
      surfaces,
      location: { status, source },
    } satisfies ApprovalVisibilityReport,
  };
}

export const approvalVisibilityWorlds = [
  world(
    "both-queues",
    "Inventory the requests my workspace device can see and preserve their queue owners.",
    "device-workspace",
    null,
    [
      snapshot("hub", "device-review"),
      snapshot("workspace", "build-review", "view-review"),
    ],
    "complete",
    [
      view("workspace", "build-review", "view-review"),
      view("hub", "device-review"),
    ],
    "unassigned",
  ),
  world(
    "empty-workspace-with-hub-down",
    "The workspace returned an empty list. Check whether the assigned request can be ruled out while the hub is unreachable.",
    "device-workspace",
    "device-review",
    [snapshot("workspace"), lost("hub")],
    "partial",
    [view("workspace"), unavailable("hub")],
    "unconfirmed",
  ),
  world(
    "workspace-owner-with-hub-down",
    "Locate the pending workspace review even though the hub queue is unavailable.",
    "device-workspace",
    "workspace-review",
    [lost("hub"), snapshot("workspace", "workspace-review")],
    "partial",
    [view("workspace", "workspace-review"), unavailable("hub")],
    "located",
    "workspace",
  ),
  world(
    "hub-owner-with-workspace-down",
    "Find the device review during a workspace outage. Keep the visibility limit in the report.",
    "device-workspace",
    "device-review",
    [snapshot("hub", "device-review"), lost("workspace")],
    "partial",
    [unavailable("workspace"), view("hub", "device-review")],
    "located",
    "hub",
  ),
  world(
    "device-before-workspace-selection",
    "The device has paired but hasn't selected a workspace. Check the account queue for the assigned request.",
    "device-account",
    "join-review",
    [snapshot("hub", "join-review")],
    "complete",
    [view("hub", "join-review")],
    "located",
    "hub",
  ),
  world(
    "linked-agent-excludes-hub",
    "Check whether the request appears in the linked agent's workspace queue. A hub snapshot belongs to a different caller tier.",
    "linked-agent",
    "hub-only",
    [snapshot("hub", "hub-only"), snapshot("workspace")],
    "complete",
    [view("workspace")],
    "absent",
  ),
  world(
    "ack-without-snapshot",
    "The connected watcher acknowledged subscriptions. Determine whether the pending set is available yet.",
    "device-workspace",
    "install-review",
    [ack("workspace"), ack("hub")],
    "unknown",
    [waiting("workspace"), waiting("hub")],
    "unconfirmed",
  ),
  world(
    "both-queues-empty",
    "Check whether the assigned approval remains pending after both queues have sent fresh empty snapshots.",
    "device-workspace",
    "closed-review",
    [snapshot("workspace"), snapshot("hub")],
    "complete",
    [view("workspace"), view("hub")],
    "absent",
  ),
  world(
    "watch-replaces-queue",
    "Use the complete replacement snapshot to determine whether the previously observed review is still pending.",
    "linked-agent",
    "earlier-review",
    [
      ack("workspace"),
      snapshot("workspace", "earlier-review"),
      snapshot("workspace", "later-review"),
    ],
    "complete",
    [view("workspace", "later-review")],
    "absent",
  ),
  world(
    "queue-lost-after-snapshot",
    "The workspace stream disconnected after showing the requested review. Describe what can be established now.",
    "device-workspace",
    "old-workspace-review",
    [
      snapshot("workspace", "old-workspace-review"),
      snapshot("hub"),
      lost("workspace"),
    ],
    "partial",
    [unavailable("workspace"), view("hub")],
    "unconfirmed",
  ),
  world(
    "reconnect-then-read",
    "Locate the pending review after a fresh hub subscription and full snapshot.",
    "device-account",
    "current-device-review",
    [lost("hub"), ack("hub"), snapshot("hub", "current-device-review")],
    "complete",
    [view("hub", "current-device-review")],
    "located",
    "hub",
  ),
  world(
    "exact-id",
    "Find the supplied approval ID, keeping similarly named requests separate.",
    "device-workspace",
    "review-2",
    [snapshot("workspace", "review-20"), snapshot("hub", "review-2")],
    "complete",
    [view("workspace", "review-20"), view("hub", "review-2")],
    "located",
    "hub",
  ),
];

export type ApprovalVisibilityWorld = (typeof approvalVisibilityWorlds)[number];
