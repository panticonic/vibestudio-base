import type { TemplateUpdateStatus } from "@vibestudio/service-schemas/templates";
import type {
  CandidateReport,
  CandidateRequest,
} from "../template-candidate/types.js";

type Check = TemplateUpdateStatus["checks"][number];
type Outcome =
  | "conflicts"
  | "clean"
  | "lost"
  | "stale-base"
  | "wrong-context"
  | "published"
  | "review-offline"
  | "main-offline";
export type CandidateWorld = {
  id: string;
  sourceGroup: string;
  request: CandidateRequest;
  initial: Check | null;
  next: Check | null;
  outcome?: Outcome;
  status: CandidateReport["status"];
  operations: string[];
};

const sourceUrl = "https://example.test/release-template.git";
const installedCommit = "1".repeat(40);
const incomingCommit = "2".repeat(40);
const source = {
  url: sourceUrl,
  ref: "refs/heads/main",
  commit: installedCommit,
};
const target = {
  ...source,
  commit: incomingCommit,
  credential: "private-binding-credential",
};
const newer = { ...target, commit: "3".repeat(40) };
const cutoff = 1795017600000;
const available: Check = {
  checkedAt: cutoff + 3_600_000,
  source,
  target,
  targetEpoch: 0,
  targetAppVersion: "0.1.106",
  status: "available",
};
const staged = ["discovery", "discovery", "prepare", "review", "main"];
const held = ["discovery"];
function scenario(
  name: string,
  goal: string,
  initial: Check | null,
  status: CandidateWorld["status"],
  options: {
    intent?: CandidateRequest["intent"];
    next?: Check;
    requestedCommit?: string;
    outcome?: Outcome;
    operations?: string[];
  } = {},
): CandidateWorld {
  return {
    id: `template-candidate-${name}`,
    sourceGroup: `vibestudio:template-candidate:${name}`,
    request: {
      goal,
      intent: options.intent ?? "stage",
      sourceUrl,
      installedCommit,
      incomingCommit: options.requestedCommit ?? incomingCommit,
      checkedAfterMs: cutoff,
      commandId: `template-update:${name}`,
    },
    initial,
    next: options.next ?? initial,
    outcome: options.outcome,
    status,
    operations: options.operations ?? (options.outcome ? staged : held),
  };
}

export const templateCandidateWorlds = [
  scenario(
    "notes-only",
    "Check whether the workspace can review the approved release next week.",
    available,
    "available",
    { intent: "inspect" },
  ),
  scenario(
    "clean-merge",
    "Set up isolated review of the upgraded preview and notification worker.",
    available,
    "validate-candidate",
    { outcome: "clean" },
  ),
  scenario(
    "coupled-conflicts",
    "Prepare the dependency update and identify the conflict work still open.",
    available,
    "resolve-conflicts",
    { outcome: "conflicts" },
  ),
  scenario(
    "cache-empty",
    "Prepare the specified release if the local upstream check supports it.",
    null,
    "discover",
  ),
  scenario(
    "expired",
    "Stage the handoff from the operations lead's checked release list.",
    { ...available, checkedAt: cutoff - 1 },
    "refresh",
  ),
  scenario(
    "status-error",
    "Find whether the scheduled release can enter review after last night's discovery failure.",
    {
      checkedAt: cutoff,
      source,
      status: "error",
      error: "private upstream diagnostic",
    },
    "discovery-error",
  ),
  scenario(
    "already-installed",
    "Check whether another review context is needed for the installed release.",
    { ...available, target: source, status: "current" },
    "current",
    { requestedCommit: installedCommit },
  ),
  scenario(
    "newer-unassigned",
    "Review the release director's exact selected commit.",
    { ...available, target: newer },
    "target-changed",
  ),
  scenario(
    "installed-drift",
    "Stage the release against the team's approved installed baseline.",
    { ...available, source: { ...source, commit: "7".repeat(40) } },
    "target-changed",
  ),
  scenario(
    "host-app-minimum",
    "Prepare the incoming layout update after the desktop host upgrade.",
    {
      ...available,
      status: "requires-app-update",
      targetMinimumAppVersion: "0.1.120",
    },
    "app-update-required",
  ),
  scenario(
    "host-epoch-absent",
    "Check whether the upcoming major release can be staged on this machine.",
    {
      ...available,
      status: "different-epoch",
      targetEpoch: 1,
      hostError: "matching host unavailable",
    },
    "matching-host-required",
  ),
  scenario(
    "epoch-handoff",
    "Prepare the selected release if it fits the normal same-epoch update procedure.",
    {
      ...available,
      status: "different-epoch",
      targetEpoch: 1,
      targetAppVersion: "1.0.4",
    },
    "epoch-review-required",
  ),
  scenario(
    "offer-race",
    "Stage exactly the vetted tag even if upstream moves during the run.",
    available,
    "offer-changed",
    {
      next: { ...available, target: newer },
      operations: ["discovery", "discovery"],
    },
  ),
  scenario(
    "main-advanced",
    "Open a handoff for the candidate if it still rests on protected main.",
    available,
    "stale-base",
    { outcome: "stale-base" },
  ),
  scenario(
    "wrong-context",
    "Return the review context for this command and this release.",
    available,
    "unconfirmed",
    { outcome: "wrong-context" },
  ),
  scenario(
    "lost-ack-partial",
    "Check whether the update staging completed after its connection dropped.",
    available,
    "unconfirmed",
    { outcome: "lost" },
  ),
  scenario(
    "review-unavailable",
    "Stage the new workspace release and verify its review context is available.",
    available,
    "unconfirmed",
    {
      outcome: "review-offline",
      operations: ["discovery", "discovery", "prepare", "review"],
    },
  ),
  scenario(
    "protected-head-unavailable",
    "Verify the staged review against protected main before handoff.",
    available,
    "unconfirmed",
    { outcome: "main-offline" },
  ),
  scenario(
    "published-concurrently",
    "Stage the exact update and identify whether a colleague finished it during handoff.",
    available,
    "already-published",
    { outcome: "published" },
  ),
];
