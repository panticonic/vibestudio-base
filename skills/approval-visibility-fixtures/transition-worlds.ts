import { createHash } from "node:crypto";
import type {
  ApprovalQueueReceipt,
  ApprovalSurfaceReview,
  ApprovalTransition,
  ApprovalTransitionReport,
  ApprovalVisibilityReport,
} from "../capabilities/natlang/types.js";

type Case = {
  id: string;
  goal: string;
  caller?: "device-workspace" | "device-account" | "linked-agent";
  earlier: readonly string[];
  later: readonly string[];
  transition: ApprovalTransition;
  locations: [
    ApprovalVisibilityReport["location"]["status"],
    ApprovalVisibilityReport["location"]["status"],
  ];
};

const cases: Case[] = [
  {
    id: "workspace-request-appears",
    goal: "Compare the two queue reads and tell me when the assigned workspace request became visible.",
    earlier: ["w:control", "h:"],
    later: ["w:control,target", "h:"],
    transition: "appeared",
    locations: ["absent", "located"],
  },
  {
    id: "hub-request-stays-pending",
    goal: "Find the assigned account request before and after the workspace queue changed.",
    earlier: ["w:", "h:target"],
    later: ["h:target", "w:control"],
    transition: "still-pending",
    locations: ["located", "located"],
  },
  {
    id: "request-changes-queue",
    goal: "Check the current owner of the request after the account and workspace snapshots changed.",
    earlier: ["w:", "h:target"],
    later: ["h:", "w:target"],
    transition: "queue-changed",
    locations: ["located", "located"],
  },
  {
    id: "request-disappears-from-complete-queues",
    goal: "Check the pending queues again for the earlier request and report what the latest view establishes.",
    earlier: ["w:target", "h:control"],
    later: ["w:", "h:control"],
    transition: "no-longer-listed",
    locations: ["located", "absent"],
  },
  {
    id: "hub-snapshot-late",
    goal: "The hub watch has now sent a snapshot. Compare it with the earlier partial view.",
    earlier: ["w:", "h:ack"],
    later: ["w:", "h:ack", "h:target"],
    transition: "now-visible",
    locations: ["unconfirmed", "located"],
  },
  {
    id: "latest-hub-read-unavailable",
    goal: "Recheck the assigned request after the hub connection dropped.",
    earlier: ["w:", "h:target"],
    later: ["w:", "h:target", "h:lost"],
    transition: "unconfirmed",
    locations: ["located", "unconfirmed"],
  },
  {
    id: "account-watch-replaces-snapshot",
    goal: "Read the account queue before and after its watch delivered a replacement snapshot.",
    caller: "device-account",
    earlier: ["h:target", "w:control"],
    later: ["h:target", "h:control"],
    transition: "no-longer-listed",
    locations: ["located", "absent"],
  },
  {
    id: "linked-agent-keeps-workspace-scope",
    goal: "Check the assigned request from the linked agent's workspace view across both observations.",
    caller: "linked-agent",
    earlier: ["w:", "h:target"],
    later: ["w:control", "h:target"],
    transition: "not-listed",
    locations: ["absent", "absent"],
  },
  {
    id: "partial-then-complete-without-target",
    goal: "Compare the two observations and explain how much the queue reads establish about the missing request.",
    earlier: ["w:lost", "h:"],
    later: ["w:control", "h:"],
    transition: "unconfirmed",
    locations: ["unconfirmed", "absent"],
  },
  {
    id: "no-queue-snapshot-after-reconnect",
    goal: "Check whether the current watch has enough evidence to report the assigned request.",
    earlier: ["w:", "h:"],
    later: ["w:ack", "h:ack"],
    transition: "unconfirmed",
    locations: ["absent", "unconfirmed"],
  },
];

export const approvalTransitionWorlds = cases.map((entry) => {
  const id = (label: string) =>
    createHash("sha256")
      .update(entry.id + ":" + label)
      .digest("hex")
      .slice(0, 24);
  const approvalId = id("target");
  const caller = entry.caller ?? "device-workspace";
  function receipts(wire: readonly string[]): ApprovalQueueReceipt[] {
    return wire.map((row) => {
      const [surface, condition] = row.split(":");
      const source = surface === "w" ? "workspace" : "hub";
      const kind =
        condition === "ack"
          ? "acknowledged"
          : condition === "lost"
            ? "unavailable"
            : "snapshot";
      return {
        source,
        kind,
        ids:
          kind === "snapshot" && condition ? condition.split(",").map(id) : [],
      };
    });
  }
  function expected(
    receipts: ApprovalQueueReceipt[],
    status: ApprovalVisibilityReport["location"]["status"],
  ): ApprovalVisibilityReport {
    const selected =
      caller === "device-workspace"
        ? (["workspace", "hub"] as const)
        : caller === "device-account"
          ? (["hub"] as const)
          : (["workspace"] as const);
    const surfaces = selected.map((source): ApprovalSurfaceReview => {
      const latest = receipts.findLast((receipt) => receipt.source === source);
      return latest?.kind === "snapshot"
        ? { source, state: "visible", ids: latest.ids }
        : {
            source,
            state:
              latest?.kind === "unavailable"
                ? "unavailable"
                : "awaiting-snapshot",
            ids: [],
          };
    });
    const visible = surfaces.filter(({ state }) => state === "visible");
    return {
      coverage:
        visible.length === surfaces.length
          ? "complete"
          : visible.length
            ? "partial"
            : "unknown",
      surfaces,
      location: {
        status,
        source:
          status === "located"
            ? (visible.find(({ ids }) => ids.includes(approvalId))?.source ??
              null)
            : null,
      },
    };
  }
  const earlier = receipts(entry.earlier),
    later = receipts(entry.later);
  return {
    id: `approval-transition-${entry.id}`,
    sourceGroup: "vibestudio:cli:approval-queue-visibility",
    request: { goal: entry.goal, caller, approvalId, earlier, later },
    expected: {
      transition: entry.transition,
      earlier: expected(earlier, entry.locations[0]),
      later: expected(later, entry.locations[1]),
    } satisfies ApprovalTransitionReport,
  };
});
