import { z } from "zod";
import { triggerSchema } from "@vibestudio/workspace-contracts/automations";
export type MissionTrigger = z.infer<typeof triggerSchema>;

export const PROTOCOL = "mission-control.v1";
export const STATUSES = [
  "inbox",
  "ready",
  "active",
  "review",
  "done",
  "cancelled",
] as const;
export const STATUS_LABELS: Record<Status, string> = {
  inbox: "Inbox",
  ready: "Ready",
  active: "In progress",
  review: "Needs review",
  done: "Done",
  cancelled: "Cancelled",
};
export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
const id = z.string().min(1).max(100);
const title = z.string().trim().min(1).max(200);
export const projectInput = z
  .object({
    name: title,
    description: z.string().max(4000).default(""),
    repos: z
      .array(
        z
          .string()
          .min(1)
          .max(512)
          .refine(
            (path) =>
              /^(projects|panels|workers|packages|skills|extensions|apps|about)\/[\w./-]+$/.test(
                path,
              ) && !path.split("/").includes(".."),
            "Select workspace repositories",
          ),
      )
      .max(100)
      .transform((paths) => [...new Set(paths)]),
    color: z
      .enum(["violet", "blue", "green", "amber", "pink"])
      .default("violet"),
  })
  .strict();
export const checklistItem = z
  .object({
    id,
    text: z.string().trim().min(1).max(500),
    done: z.boolean().default(false),
  })
  .strict();
export const taskInput = z
  .object({
    projectId: id,
    title,
    description: z.string().max(16000).default(""),
    status: z.enum(STATUSES).default("inbox"),
    priority: z.enum(PRIORITIES).default("normal"),
    category: z.string().trim().max(80).default(""),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(30)
      .default([])
      .transform((tags) => [...new Set(tags)]),
    dependencies: z
      .array(id)
      .max(50)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    checklist: z
      .array(checklistItem)
      .max(100)
      .default([])
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Checklist item IDs must be unique",
      ),
    dueAt: z.number().int().nonnegative().nullable().default(null),
    historyMode: z.enum(["overview", "conversation"]).default("overview"),
  })
  .strict();
export const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .superRefine((value, context) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use a valid IANA timezone",
      });
    }
  })
  .transform(
    (value) =>
      new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
        .timeZone,
  );
export const viewInput = z
  .object({
    projectId: id.nullable().default(null),
    query: z.string().max(200).default(""),
    statuses: z.array(z.enum(STATUSES)).max(6).default([]),
    priorities: z.array(z.enum(PRIORITIES)).max(4).default([]),
    tag: z.string().max(40).default(""),
    category: z.string().max(80).default(""),
    timezone: timeZone.default("UTC"),
    due: z.enum(["any", "overdue", "today", "week", "none"]).default("any"),
    execution: z.enum(["any", "linked", "unlinked"]).default("any"),
    blocked: z.boolean().default(false),
    layout: z.enum(["board", "list", "agenda"]).default("board"),
    sort: z.enum(["priority", "updated", "due"]).default("priority"),
  })
  .strict();
export type ProjectInput = z.input<typeof projectInput>;
export type TaskInput = z.input<typeof taskInput>;
export type View = z.output<typeof viewInput>;
export type Project = z.output<typeof projectInput> & {
  id: string;
  revision: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};
export type Task = z.output<typeof taskInput> & {
  id: string;
  revision: number;
  automationId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type SavedView = { id: string; name: string; view: View };
export type DependencySummary = {
  total: number;
  done: number;
  blockedIds: string[];
};
export type TaskEvent = {
  id: string;
  taskId: string;
  kind:
    | "created"
    | "updated"
    | "note"
    | "duplicated"
    | "automation-linked"
    | "cancelled";
  summary: string;
  createdAt: number;
  changedFields?: string[];
  text?: string;
  sourceTaskId?: string;
};
export type Overview = {
  facets: { categories: string[]; tags: string[] };
  dependencySummaries: Record<string, DependencySummary>;
  projects: Project[];
  tasks: Task[];
  view: View;
  views: SavedView[];
  cursor: string | null;
  total: number;
  counts: Record<Status, number>;
};
export type Session = {
  runId: string;
  missionId: string;
  phase: string;
  outcome?: string;
  startedAt: number;
  finishedAt?: number;
  channelId?: string;
  contextId?: string;
  executorId?: string;
  finalMessage?: string;
  completionResponse?: string;
  failure?: { message: string };
};
export type Automation = {
  missionId: string;
  name: string;
  state: "active" | "paused" | "completed" | "retired";
  nextRunAt?: number;
  runCount: number;
  charter: { trigger: MissionTrigger };
  authority: { requestIds: string[]; grantIds: string[]; denialIds: string[] };
};
export type TaskDetail = {
  activity: TaskEvent[];
  activityCursor: string | null;
  dependencies: Task[];
  task: Task;
  project: Project;
  automation: Automation | null;
  runs: Session[];
  cursor: { startedAt: number; runId: string } | null;
};
export const emptyView = (): View => viewInput.parse({});

export const LEAD_INSTRUCTIONS = `You are Mission lead, the single coordinator for this workspace's Mission Control.
Turn the user's flowing ideas and goals into concrete projects and tasks. Survey current work before acting. Keep cards and the user's saved view in sync with the conversation. Organize, move, categorize, tag, prioritize, cancel and execute tasks through the mission_control tool. Call overview first; getTask before editing. Preserve unrelated fields and pass expectedRevision; on a conflict reread and reconsider. Never silently overwrite a human edit.
Select real repository paths discovered with workspace.sourceTree. Repository associations describe the scope of work, not a security boundary. Respect normal approvals and VCS publication rules. Do not start unrelated work simply to populate the board.
Use updateTask with changes.checklist for concrete acceptance steps, addNote for durable task context, and duplicateTask to reuse a plan without copying execution or accepted checklist progress. Read taskDetail for notes and activity.
Use setView to present a useful slice after organizing work. Use saveView for reusable views. Use startTask for execution; configureAutomation for recurrence (five-field cron and IANA timezone or interval >= one minute); controlTask for pause/resume and startTask/cancelTask for run/cancel. Pause only stops future schedule occurrences; cancelTask interrupts and joins live runs before marking the card cancelled. Tasks and executions have distinct states: a finished agent run can still need human review. Keep completed results in review until accepted. Use taskDetail for canonical run history and conversation coordinates. Never invent execution status or delete chat to make an overview smaller.`;

export function executionPrompt(task: Pick<Task, "id">): string {
  return `Execute Mission Control task ${task.id}.
First call mission_control.taskDetail with {id:"${task.id}"} to read its current card and project. The card is the live source of truth: use its current title, description, checklist, notes, project repository selections, and dependency IDs; never use a stale charter snapshot. Repository associations describe the intended scope and do not grant authority.
If the card is cancelled or its project is archived, report that no execution is required and stop. For a manual automation, also stop if the card is done. A recurring automation represents a series: done describes the accepted previous occurrence and the next scheduled occurrence can begin new work on this same card. Read each dependency with getTask; if any is not done, report the blocker and stop. Otherwise move the card to active with updateTask and its expectedRevision before doing work. If a concurrent edit changes the card, reread and reconsider.
Use the normal workspace tools, approvals, verification, and publication workflow. Read repository guidance before changes. Use mission_control to report blockers or move the card to review with a concise outcome when delivered; do not mark done without acceptance. Preserve human edits. Return a concise final summary with evidence; the platform retains it in the task's run ledger.`;
}

/** Calendar bounds in the persisted view's timezone, including DST-short/long days. */
export function dueDayBounds(
  now: number,
  timezone: string,
): { today: number; tomorrow: number; week: number } {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const civilDay = (instant: number): number => {
    const parts = formatter.formatToParts(instant);
    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)!.value);
    return Date.UTC(value("year"), value("month") - 1, value("day"));
  };
  const date = civilDay(now);
  const day = 86_400_000;
  // Find the first instant of this civil date. This also handles zones whose
  // clock jumps over midnight: the day begins at the first existing local time.
  const boundary = (date: number): number => {
    let low = date - 2 * day;
    let high = date + 2 * day;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (civilDay(middle) < date) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return {
    today: boundary(date),
    tomorrow: boundary(date + day),
    week: boundary(date + 7 * day),
  };
}
