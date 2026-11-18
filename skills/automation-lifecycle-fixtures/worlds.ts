import type {
  LifecycleAction,
  LifecycleReport,
  LifecycleRequest,
  LifecycleState,
  MissionObservation,
} from "../automation-lifecycle/types.js";

type Readback =
  | LifecycleState
  | "different-revision"
  | "different-id"
  | "offline"
  | null;
type Options = {
  reads: Readback[];
  effect?: LifecycleState | "acknowledgment-lost" | "wrong-receipt";
  result: LifecycleReport["status"];
};

function author(
  slug: string,
  group: string,
  goal: string,
  action: LifecycleAction,
  options: Options,
) {
  const missionId = "fixture-mission-" + slug;
  const revisionDigest = "reviewed-" + slug;
  const request: LifecycleRequest = { goal, action, missionId, revisionDigest };
  function adapt(row: Readback): MissionObservation | "offline" | null {
    if (row === null || row === "offline") return row;
    if (row === "different-revision")
      return { missionId, revisionDigest: "replacement", state: "active" };
    if (row === "different-id")
      return { missionId: "unrelated", revisionDigest, state: "paused" };
    return { missionId, revisionDigest, state: row };
  }
  const reads = options.reads.map(adapt);
  const final = reads.at(-1);
  const verified =
    final && final !== "offline" && final.missionId === missionId
      ? final
      : null;
  const expected: LifecycleReport = {
    missionId,
    status: options.result,
    state: verified?.state ?? null,
    revisionDigest: verified?.revisionDigest ?? null,
  };
  return {
    id: "automation-lifecycle-" + slug,
    sourceGroup: "vibestudio:automations:" + group,
    request,
    reads,
    effect: options.effect,
    expected,
  };
}

export const automationLifecycleWorlds = [
  author(
    "maintenance-window",
    "pause-confirmed",
    "Pause the assigned build reminder during the maintenance window.",
    "pause",
    {
      reads: ["active", "active", "paused"],
      effect: "paused",
      result: "applied",
    },
  ),
  author(
    "resume-editor-check",
    "resume-confirmed",
    "Resume the existing editor check now that the review is complete.",
    "resume",
    {
      reads: ["paused", "paused", "active"],
      effect: "active",
      result: "applied",
    },
  ),
  author(
    "paused-before-review",
    "already-satisfied",
    "Ensure the reminder is paused while the schedule is being reviewed.",
    "pause",
    { reads: ["paused"], result: "unchanged" },
  ),
  author(
    "already-resumed",
    "already-satisfied",
    "Confirm the existing weekly recap is active again.",
    "resume",
    { reads: ["active"], result: "unchanged" },
  ),
  author(
    "completed-reminder",
    "terminal-mission",
    "Resume the session reminder if the assigned schedule can still run.",
    "resume",
    { reads: ["completed"], result: "held" },
  ),
  author(
    "retired-report",
    "terminal-mission",
    "Inspect the assigned old report schedule before pausing it.",
    "pause",
    { reads: ["retired"], result: "held" },
  ),
  author(
    "definition-replaced",
    "revision-race",
    "Pause only the reviewed edition of the reminder.",
    "pause",
    { reads: ["different-revision"], result: "held" },
  ),
  author(
    "changed-while-pausing",
    "revision-race",
    "Pause the reviewed Friday reminder, leaving a concurrently edited version alone.",
    "pause",
    {
      reads: ["active", "different-revision", "different-revision"],
      result: "held",
    },
  ),
  author(
    "completed-before-resume",
    "terminal-mission",
    "Resume the selected automation only if it has not completed in the meantime.",
    "resume",
    { reads: ["paused", "completed", "completed"], result: "held" },
  ),
  author(
    "concurrent-pause",
    "already-satisfied",
    "Ensure the selected check is paused if another operator has already applied the change.",
    "pause",
    { reads: ["active", "paused", "paused"], result: "unchanged" },
  ),
  author(
    "lost-reply-confirmed",
    "unsettled-acknowledgment",
    "Pause the assigned job and reconcile its current state if the response is lost.",
    "pause",
    {
      reads: ["active", "active", "paused"],
      effect: "acknowledgment-lost",
      result: "reconciled",
    },
  ),
  author(
    "lost-reply-still-paused",
    "unsettled-acknowledgment",
    "Resume the morning reminder once and confirm whether it became active.",
    "resume",
    {
      reads: ["paused", "paused", "paused"],
      effect: "acknowledgment-lost",
      result: "uncertain",
    },
  ),
  author(
    "no-postcondition",
    "unavailable-readback",
    "Confirm actual pause after the control call, even if status readback fails.",
    "pause",
    {
      reads: ["active", "active", "offline"],
      effect: "paused",
      result: "uncertain",
    },
  ),
  author(
    "replaced-after-resume",
    "revision-race",
    "Resume the selected revision and confirm the same definition is active.",
    "resume",
    {
      reads: ["paused", "paused", "different-revision"],
      effect: "active",
      result: "uncertain",
    },
  ),
  author(
    "wrong-effect-receipt",
    "unsettled-acknowledgment",
    "Confirm the original follow-up reminder's paused state without attributing another mission's receipt.",
    "pause",
    {
      reads: ["active", "active", "paused"],
      effect: "wrong-receipt",
      result: "reconciled",
    },
  ),
  author(
    "mission-not-visible",
    "unavailable-readback",
    "Check whether the caller's selected reminder can be paused.",
    "pause",
    { reads: [null], result: "held" },
  ),
  author(
    "readback-wrong-mission",
    "unavailable-readback",
    "Resume only the assigned automation when the controller reports an unrelated mission.",
    "resume",
    { reads: ["different-id"], result: "held" },
  ),
];
