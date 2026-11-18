import type {
  AutomationReport,
  AutomationRequest,
  ControlChoice,
  ExecutorKind,
  MissionRun,
  MissionState,
  Operation,
  Trigger,
  VisibleAutomation,
} from "../automations/types.js";

type Expected =
  | Exclude<AutomationReport, { kind: "hold" }>
  | { kind: "hold"; reason: RegExp };
const originalTime = "2026-10-20T12:00:00Z";
function world(
  id: string,
  source: string,
  goal: string,
  expected: Expected,
  input: Partial<AutomationRequest> = {},
) {
  return {
    id: `automation-${id}`,
    sourceGroup: `vibestudio:automations:${source}`,
    request: {
      goal,
      timezone: "Europe/Berlin",
      now: originalTime,
      visible: [],
      availableOperations: [],
      ...input,
    },
    expected,
  };
}

const weekdays = "MON,TUE,WED,THU,FRI";
const status = { service: "vcs", method: "status", use: "action" } as const;
const listFiles = {
  service: "fs",
  method: "readdir",
  use: "conditional",
} as const;
const logs = { service: "serverLog", method: "query", use: "action" } as const;
const cache = { service: "docs", method: "search", use: "action" } as const;

function launch(
  id: string,
  group: string,
  goal: string,
  executor: ExecutorKind,
  trigger: Trigger,
  conversation: "continue" | "fresh" = "continue",
  operations: Operation[] = [],
  available = [status, listFiles, logs, cache],
) {
  return world(
    id,
    group,
    goal,
    { kind: "launch", executor, trigger, conversation, operations },
    { availableOperations: available },
  );
}
function visible(
  id: string,
  name: string,
  state: MissionState,
  latestRun: MissionRun | null = null,
): VisibleAutomation {
  return { id, name, state, latestRun };
}
function control(
  id: string,
  group: string,
  goal: string,
  automation: VisibleAutomation,
  action: ControlChoice,
) {
  return world(
    id,
    group,
    goal,
    { kind: "control", automationId: automation.id, action },
    {
      visible: [
        automation,
        visible("archive-copy", "Archive rehearsal", "paused"),
      ],
    },
  );
}

export const automationWorlds = [
  launch(
    "weekday-inbox",
    "weekday-fixed",
    "At 9 every weekday New York time, remind me with the exact text: Open the queue.",
    "notify",
    {
      kind: "cron",
      expression: `0 9 * * ${weekdays}`,
      timezone: "America/New_York",
    },
  ),
  launch(
    "ireland-calendar",
    "weekday-fixed",
    "At 08:15 each weekday in Dublin, send me the fixed reminder ‘Inspect overnight handoff’ exactly six times.",
    "notify",
    {
      kind: "cron",
      expression: `15 8 * * ${weekdays}`,
      timezone: "Europe/Dublin",
      maxRuns: 6,
    },
  ),
  launch(
    "cap-admissions",
    "manual-and-capped",
    "Every 20 minutes for five runs, notify me with exactly ‘Take a walk’.",
    "notify",
    { kind: "schedule", everyMs: 1200000, maxRuns: 5 },
  ),
  launch(
    "on-demand-fixed",
    "manual-and-capped",
    "Create a reminder I run on demand: ‘Check projector cable’.",
    "notify",
    { kind: "manual" },
  ),
  launch(
    "status-periodic",
    "fixed-status",
    "In this conversation every 40 minutes run a fixed script that reads vcs.status and prints its exact state every time.",
    "eval",
    { kind: "schedule", everyMs: 2400000 },
    "continue",
    [status],
  ),
  launch(
    "status-handbook",
    "fixed-status",
    "Every Thursday at 05:05 Berlin time in a new conversation, run a fixed script that reads vcs.status and prints its exact clean flag.",
    "eval",
    { kind: "cron", expression: "5 5 * * THU", timezone: "Europe/Berlin" },
    "fresh",
    [status],
  ),
  launch(
    "only-when-dirty",
    "quiet-watch",
    "Every 25 minutes in this conversation, read vcs.status and only speak when the clean flag changes.",
    "watch",
    { kind: "schedule", everyMs: 1500000 },
    "continue",
    [status],
  ),
  launch(
    "conditional-inventory",
    "quiet-watch",
    "Every 30 minutes in this conversation check vcs.status and wake the agent only when main diverges. List the assigned folder with fs.readdir only on that condition.",
    "watch",
    { kind: "schedule", everyMs: 1800000 },
    "continue",
    [status, listFiles],
  ),
  launch(
    "compose-brief",
    "new-topic-analysis",
    "At 17:20 every Tuesday in Copenhagen time, start a fresh conversation, inspect the server logs through serverLog.query, summarize what changed, then notify me with the result.",
    "prompt",
    {
      kind: "cron",
      expression: "20 17 * * TUE",
      timezone: "Europe/Copenhagen",
    },
    "fresh",
    [logs],
  ),
  launch(
    "reference-digest",
    "new-topic-analysis",
    "Start a fresh topic for the monthly docs digest. At noon Berlin time on day 1, use docs.search to find the new API entries and decide which to explain.",
    "prompt",
    { kind: "cron", expression: "0 12 1 * *", timezone: "Europe/Berlin" },
    "fresh",
    [cache],
  ),
  launch(
    "manual-known-tool",
    "exact-tool",
    "On demand invoke the existing server-log stats tool exactly as named server_log_stats with args {} and show its raw output. Keep the current conversation.",
    "tool",
    { kind: "manual" },
  ),
  launch(
    "hourly-known-tool",
    "exact-tool",
    "Each hour call my existing workspace tool named print_project_label with exact arguments {format:'short'} and output it verbatim here.",
    "tool",
    { kind: "schedule", everyMs: 3600000 },
  ),
  launch(
    "spring-midnight-boundary",
    "seasonal-exclusive-boundary",
    "Every day at 10:00 New York time through October 31, 2026 inclusive, remind me ‘Submit the room report’.",
    "notify",
    {
      kind: "cron",
      expression: "0 10 * * *",
      timezone: "America/New_York",
      untilAt: Date.parse("2026-11-01T04:00:00Z"),
    },
  ),
  launch(
    "relative-duration",
    "relative-elapsed",
    "For the next two weeks, every 90 minutes remind me ‘Check the room meter’.",
    "notify",
    {
      kind: "schedule",
      everyMs: 5400000,
      untilAt: Date.parse("2026-11-03T12:00:00Z"),
    },
  ),
  world(
    "cadence-below-minimum",
    "invalid-cadence",
    "Remind me ‘Clock check’ every ten seconds.",
    { kind: "hold", reason: /minute|cadence|seconds/iu },
  ),
  world(
    "unclear-shared-continuation",
    "continuity-choice",
    "Every four hours, assess the unfinished investigation using what we've said here, then notify me with anything urgent.",
    { kind: "hold", reason: /conversation|continue|fresh|context/iu },
  ),
  world(
    "missing-projected-service",
    "forecast-authority",
    "Every ten minutes here, call the unlisted inventory service's reconcile operation and decide whether I need to act.",
    { kind: "hold", reason: /operation|inventory|available|service/iu },
    { availableOperations: [status, cache] },
  ),
  control(
    "stop-reversible",
    "stop-vs-remove",
    "Turn off Opening checks for now.",
    visible("opening", "Opening checks", "active"),
    "pause",
  ),
  control(
    "disable-reversible",
    "stop-vs-remove",
    "Disable Quarterly handoff.",
    visible("quarter", "Quarterly handoff", "active"),
    "pause",
  ),
  control(
    "remove-explicit",
    "stop-vs-remove",
    "Permanently remove Old poster reminder.",
    visible("poster", "Old poster reminder", "paused"),
    "retire",
  ),
  control(
    "resume-same-plan",
    "observed-state",
    "Resume Build readiness now with its existing weekday schedule.",
    visible("build", "Build readiness", "paused"),
    "resume",
  ),
  control(
    "manual-existing",
    "observed-state",
    "Run the existing Inventory scan once now.",
    visible("inventory", "Inventory scan", "active"),
    "run",
  ),
  world(
    "retired-cannot-resume",
    "observed-state",
    "Resume Scrapped job.",
    { kind: "hold", reason: /retired|resume|state/iu },
    { visible: [visible("old", "Scrapped job", "retired")] },
  ),
  world(
    "duplicate-names",
    "visible-identity",
    "Pause Status report.",
    { kind: "hold", reason: /ambiguous|which|multiple|more than one|two/iu },
    {
      visible: [
        visible("west", "Status report", "active"),
        visible("east", "Status report", "active"),
      ],
    },
  ),
  world(
    "exact-id-wins",
    "visible-identity",
    "Pause Status report with id west.",
    { kind: "control", automationId: "west", action: "pause" },
    {
      visible: [
        visible("west", "Status report", "active"),
        visible("east", "Status report", "active"),
      ],
    },
  ),
  world(
    "unseen-owner",
    "visible-identity",
    "Stop Simone's private automation Open books.",
    { kind: "hold", reason: /visible|found|authorized|access|match/iu },
    { visible: [visible("active", "Open books rehearsal", "active")] },
  ),
  world(
    "recorded-child-failure",
    "failed-run-state",
    "What happened on the most recent Import review run?",
    {
      kind: "inspect",
      automationId: "import",
      runId: "run-2",
      state: "active",
      outcome: "completed-with-errors",
      failedOperations: ["fs.readdir", "vcs.status"],
    },
    {
      visible: [
        visible("import", "Import review", "active", {
          id: "run-2",
          phase: "finished",
          outcome: "completed-with-errors",
          errors: [
            { operation: "fs.readdir", description: "permission denied" },
            { operation: "vcs.status", description: "source moved" },
          ],
        }),
      ],
    },
  ),
  world(
    "failed-run-not-paused",
    "failed-run-state",
    "Did the last Daily build health automation pause? Explain its current state and latest result.",
    {
      kind: "inspect",
      automationId: "daily",
      runId: "build-9",
      state: "active",
      outcome: "failed",
      failedOperations: ["build.getBuildReport"],
    },
    {
      visible: [
        visible("daily", "Daily build health", "active", {
          id: "build-9",
          phase: "finished",
          outcome: "failed",
          errors: [
            { operation: "build.getBuildReport", description: "script failed" },
          ],
        }),
      ],
    },
  ),
  world(
    "queued-not-completed",
    "nonterminal-ledger",
    "Is there a finished Preview handoff result yet? Just check.",
    {
      kind: "inspect",
      automationId: "preview",
      runId: "prev-1",
      state: "active",
      outcome: null,
      failedOperations: [],
    },
    {
      visible: [
        visible("preview", "Preview handoff", "active", {
          id: "prev-1",
          phase: "queued",
          outcome: null,
          errors: [],
        }),
      ],
    },
  ),
  world(
    "empty-run-list",
    "nonterminal-ledger",
    "What is the state of Morning scan and has it ever run?",
    {
      kind: "inspect",
      automationId: "scan",
      runId: null,
      state: "paused",
      outcome: null,
      failedOperations: [],
    },
    { visible: [visible("scan", "Morning scan", "paused")] },
  ),
  world(
    "skipped-overlap",
    "overlap-ledger",
    "Explain the last run of Export check. Do not change the automation.",
    {
      kind: "inspect",
      automationId: "export",
      runId: "ex-33",
      state: "active",
      outcome: "skipped",
      failedOperations: [],
    },
    {
      visible: [
        visible("export", "Export check", "active", {
          id: "ex-33",
          phase: "finished",
          outcome: "skipped",
          errors: [],
        }),
      ],
    },
  ),
  world(
    "retired-history",
    "overlap-ledger",
    "Show what the most recent Desk lamp check did and whether the automation is retired.",
    {
      kind: "inspect",
      automationId: "lamp",
      runId: "lamp-22",
      state: "retired",
      outcome: "succeeded",
      failedOperations: [],
    },
    {
      visible: [
        visible("lamp", "Desk lamp check", "retired", {
          id: "lamp-22",
          phase: "finished",
          outcome: "succeeded",
          errors: [],
        }),
      ],
    },
  ),
];

export type AutomationWorld = (typeof automationWorlds)[number];
