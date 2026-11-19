/** How an automation runs each time it fires. */
export type ExecutorKind = "notify" | "prompt" | "tool" | "watch" | "eval" | "method";

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** What a scheduling request says, before any date or cron arithmetic. */
export type ScheduleReading = {
  /** "manual" when the work only runs on demand, "interval" for an elapsed period (every 15 minutes, every 2 hours), "calendar" for wall-clock times (every day at 9, Thursdays at 05:05, the 1st of each month). */
  cadence: "manual" | "interval" | "calendar";
  /** interval only: the period in whole minutes (2 hours is 120, 1 day is 1440); otherwise null. */
  everyMinutes: number | null;
  /** calendar only: local hour 0-23 (use 24-hour time: 5pm is 17); otherwise null. */
  hour: number | null;
  /** calendar only: local minute 0-59, 0 when the request names only an hour; otherwise null. */
  minute: number | null;
  /** calendar only: the days of the week it runs on; empty means every day. */
  weekdays: Weekday[];
  /** calendar only: the day of the month 1-31 it runs on, or null. */
  dayOfMonth: number | null;
  /** The IANA timezone the request names (America/New_York), or null when it names none. */
  timezone: string | null;
  /** The last calendar day, as YYYY-MM-DD, on which a run may start, when the request gives an absolute end date; otherwise null. */
  lastDay: string | null;
  /** When the request says "for the next N days/weeks/months", the length in days (2 weeks is 14); otherwise null. */
  forDays: number | null;
  /** Stop after this many runs, when the request says so; otherwise null. */
  maxRuns: number | null;
};

/** The trigger `launch_automation` takes. `untilAt` is an exclusive UTC instant in epoch milliseconds. */
export type Trigger =
  | { kind: "manual" }
  | { kind: "schedule"; everyMs: number; untilAt?: number; maxRuns?: number }
  | { kind: "cron"; expression: string; timezone: string; untilAt?: number; maxRuns?: number };

export type MissionState = "active" | "paused" | "retired";
export type MissionRun = {
  id: string;
  phase: "queued" | "executing" | "finished";
  outcome: "succeeded" | "failed" | "completed-with-errors" | "skipped" | null;
  errors: { operation: string; description: string }[];
};
export type VisibleAutomation = { id: string; name: string; state: MissionState; latestRun: MissionRun | null };
export type Operation = { service: string; method: string; use: "action" | "conditional" };
export type AutomationRequest = {
  goal: string;
  timezone: string;
  now: string;
  visible: VisibleAutomation[];
  availableOperations: Operation[];
};
export type AutomationIntent = "launch" | "control" | "inspect";
export type ConversationChoice = "continue" | "fresh" | "clarify";
export type ControlChoice = "pause" | "resume" | "run" | "retire";
export type LaunchDraft = {
  kind: "launch"; executor: ExecutorKind; trigger: Trigger;
  conversation: "continue" | "fresh"; operations: Operation[];
};
export type ControlDraft = { kind: "control"; automationId: string; action: ControlChoice };
export type RunBrief = {
  kind: "inspect"; automationId: string; runId: string | null;
  state: MissionState; outcome: MissionRun["outcome"]; failedOperations: string[];
};
export type AutomationHold = { kind: "hold"; reason: string };
export type AutomationReport = LaunchDraft | ControlDraft | RunBrief | AutomationHold;
export type RunSelection =
  | { kind: "found"; automation: VisibleAutomation }
  | { kind: "hold"; reason: string };
