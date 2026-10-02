import { useState } from "react";
import {
  Orbit,
  Play,
  ArrowUpRight,
  Clock3,
  CalendarClock,
  CircleDot,
  Check,
  X,
  Search,
} from "@workspace/ui/icons";
import {
  STATUS_LABELS,
  type Task,
  type Project,
  type Session,
  type View,
  type Overview,
  type TaskDetail,
} from "@workspace/mission-control";
import { Modal } from "./forms";

export const timestamp = (time: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
const dateLabel = (time: number, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(time);
const dayKey = (time: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
};
export const overdue = (task: Task, timezone: string) =>
  task.dueAt !== null &&
  !["done", "cancelled"].includes(task.status) &&
  dayKey(task.dueAt, timezone) < dayKey(Date.now(), timezone);
export function dueLabel(
  task: Task,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  if (task.dueAt === null) return "No due date";
  if (dayKey(task.dueAt, timezone) === dayKey(Date.now(), timezone))
    return "Due today";
  return `${overdue(task, timezone) ? "Overdue · " : ""}${dateLabel(task.dueAt, timezone)}`;
}
export function TaskCard({
  task,
  project,
  dependency,
  timezone,
  open,
  start,
  selected,
  select,
  busy,
  startBusy,
}: {
  task: Task;
  timezone: string;
  project?: Project;
  dependency?: Overview["dependencySummaries"][string];
  open: () => void;
  start: () => void;
  selected: boolean;
  select: () => void;
  busy: boolean;
  startBusy: boolean;
}) {
  const completed = task.checklist.filter((item) => item.done).length;
  const blocked = Boolean(dependency?.blockedIds.length);
  return (
    <article
      className={`mc-card ${selected ? "mc-card-selected" : ""}`}
      draggable={!busy}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="mc-card-top">
        <span className={`mc-priority mc-priority-${task.priority}`}>
          <span />
          {task.priority}
        </span>
        <input
          type="checkbox"
          aria-label={`Select ${task.title}`}
          disabled={busy}
          checked={selected}
          onChange={select}
        />
      </div>
      <button className="mc-card-title" disabled={busy} onClick={open}>
        {task.title}
      </button>
      {task.description && (
        <p className="mc-card-description">{task.description}</p>
      )}
      <div className="mc-tags">
        {task.category && <span className="mc-category">{task.category}</span>}
        {task.tags.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {task.tags.length > 3 && (
          <span title={task.tags.slice(3).join(", ")}>
            +{task.tags.length - 3}
          </span>
        )}
      </div>
      {(task.checklist.length > 0 || task.dependencies.length > 0) && (
        <div className="mc-card-signals">
          {task.checklist.length > 0 && (
            <span>
              <Check size={12} />
              {completed}/{task.checklist.length}
              <progress
                aria-label={`${task.title} checklist progress`}
                value={completed}
                max={task.checklist.length}
              />
            </span>
          )}
          {task.dependencies.length > 0 && (
            <span
              className={blocked ? "mc-dependency-badge" : ""}
              title={
                blocked
                  ? "Accept the remaining dependencies before execution."
                  : "Dependencies accepted"
              }
            >
              {blocked
                ? `${dependency!.blockedIds.length} blocked`
                : `${task.dependencies.length} dependencies`}
            </span>
          )}
        </div>
      )}
      <div className="mc-card-footer">
        <span
          className={`mc-project-label mc-color-${project?.color ?? "violet"}`}
        >
          <i />
          {project?.name ?? "Project"}
        </span>
        {task.automationId && (
          <CalendarClock size={14} aria-label="Has agent execution" />
        )}
        {task.dueAt !== null && (
          <span
            className={`mc-due ${overdue(task, timezone) ? "mc-overdue" : ""}`}
            title={timestamp(task.dueAt)}
          >
            <Clock3 size={12} />
            {dueLabel(task, timezone)}
          </span>
        )}
      </div>
      {task.status === "ready" && (
        <button
          className="mc-card-start"
          onClick={start}
          disabled={busy || startBusy || blocked}
          title={
            blocked ? "Waiting for dependencies" : "Launch a real agent session"
          }
        >
          <Play size={12} />
          {blocked
            ? "Waiting for dependencies"
            : startBusy
              ? "Launching agent…"
              : "Start agent"}
          <ArrowUpRight size={12} />
        </button>
      )}
    </article>
  );
}

export function RunRow({
  run,
  showConversation,
  open,
  busy,
}: {
  run: Session;
  showConversation: boolean;
  open: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState("");
  const summary =
    run.failure?.message ??
    run.completionResponse ??
    run.finalMessage ??
    (run.phase === "terminal"
      ? "Run finished without a summary."
      : "Working. Open the conversation to inspect the current execution.");
  const labels: Record<string, string> = {
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
    skipped: "Skipped",
    executing: "Executing",
    "waiting-for-approval": "Awaiting approval",
    preparing: "Preparing conversation",
  };
  const state = run.outcome ?? run.phase;
  const collapsible = summary.length > 400 || summary.split("\n").length > 5;
  return (
    <div className={`mc-run mc-run-${state}`}>
      <div className="mc-run-header">
        <span
          className={`mc-run-status ${run.phase === "terminal" ? "" : "mc-live"}`}
        >
          <CircleDot size={13} />
          {labels[state] ?? state.replaceAll("-", " ")}
        </span>
        <time
          dateTime={new Date(run.startedAt).toISOString()}
          title={new Date(run.startedAt).toLocaleString()}
        >
          {timestamp(run.startedAt)}
        </time>
      </div>
      <p
        className={`mc-run-summary ${collapsible ? "mc-run-collapsible" : ""} ${expanded ? "mc-run-expanded" : ""}`}
      >
        {summary}
      </p>
      {collapsible && (
        <button
          className="mc-text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse summary" : "Read full summary"}
        </button>
      )}
      <div className="mc-run-footer">
        {run.finishedAt !== undefined && (
          <span className="mc-help">
            {Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000))}{" "}
            seconds
          </span>
        )}
        <button
          className="mc-text-button"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(summary);
                setCopyState("Summary copied");
              } catch (error) {
                setCopyState(
                  error instanceof Error ? error.message : String(error),
                );
              }
            })();
          }}
        >
          Copy summary
        </button>
        {showConversation && run.channelId && run.contextId && (
          <button className="mc-text-button" disabled={busy} onClick={open}>
            Open conversation
            <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {copyState && (
        <p role="status" className="mc-help">
          {copyState}
        </p>
      )}
    </div>
  );
}

export function TaskList({
  tasks,
  projects,
  timezone,
  selected,
  toggle,
  open,
  busy,
}: {
  tasks: Task[];
  projects: Project[];
  timezone: string;
  selected: Set<string>;
  toggle: (id: string) => void;
  open: (task: Task) => void;
  busy: boolean;
}) {
  return (
    <div className="mc-list">
      <div className="mc-list-header">
        <span aria-hidden="true" />
        <span>Task</span>
        <span>Project</span>
        <span>Priority</span>
        <span>Status</span>
        <span>Due</span>
      </div>
      {tasks.map((task) => (
        <div className="mc-list-row" key={task.id}>
          <input
            className="mc-list-select"
            type="checkbox"
            aria-label={`Select ${task.title}`}
            disabled={busy}
            checked={selected.has(task.id)}
            onChange={() => toggle(task.id)}
          />
          <button
            className="mc-list-task"
            disabled={busy}
            onClick={() => open(task)}
          >
            <strong>{task.title}</strong>
            <small>
              {task.category || task.tags.join(" · ") || "No category"}
            </small>
          </button>
          <span>
            {projects.find((project) => project.id === task.projectId)?.name}
          </span>
          <span className={`mc-priority mc-priority-${task.priority}`}>
            <i />
            {task.priority}
          </span>
          <span>{STATUS_LABELS[task.status]}</span>
          <span>{task.dueAt === null ? "—" : dueLabel(task, timezone)}</span>
        </div>
      ))}
    </div>
  );
}

export function Agenda({
  tasks,
  projects,
  timezone,
  open,
  busy,
}: {
  tasks: Task[];
  projects: Project[];
  timezone: string;
  open: (task: Task) => void;
  busy: boolean;
}) {
  const groups = new Map<string, Task[]>();
  [...tasks]
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
    .forEach((task) => {
      const key =
        task.dueAt === null
          ? "Unscheduled"
          : new Intl.DateTimeFormat(undefined, {
              timeZone: timezone,
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(task.dueAt);
      groups.set(key, [...(groups.get(key) ?? []), task]);
    });
  return (
    <div className="mc-agenda">
      {[...groups].map(([day, items]) => (
        <section className="mc-agenda-day" key={day}>
          <h3 className="mc-agenda-heading">
            <CalendarClock size={17} />
            {day}
            <span>{items.length}</span>
          </h3>
          {items.map((task) => (
            <button
              className="mc-agenda-task"
              disabled={busy}
              key={task.id}
              onClick={() => open(task)}
            >
              <span className={`mc-priority mc-priority-${task.priority}`}>
                {task.priority}
              </span>
              <strong>
                {task.title}
                <small>
                  {
                    projects.find((project) => project.id === task.projectId)
                      ?.name
                  }
                </small>
              </strong>
              <span>{STATUS_LABELS[task.status]}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function FilterChips({
  view,
  change,
  busy,
}: {
  view: View;
  change: (view: View) => void;
  busy: boolean;
}) {
  const chips: { label: string; remove: () => void }[] = [
    ...view.statuses.map((status) => ({
      label: STATUS_LABELS[status],
      remove: () =>
        change({
          ...view,
          statuses: view.statuses.filter((item) => item !== status),
        }),
    })),
    ...view.priorities.map((priority) => ({
      label: `${priority} priority`,
      remove: () =>
        change({
          ...view,
          priorities: view.priorities.filter((item) => item !== priority),
        }),
    })),
    ...(view.tag
      ? [
          {
            label: `Tag: ${view.tag}`,
            remove: () => change({ ...view, tag: "" }),
          },
        ]
      : []),
    ...(view.category
      ? [
          {
            label: view.category,
            remove: () => change({ ...view, category: "" }),
          },
        ]
      : []),
    ...(view.query
      ? [
          {
            label: `Search: ${view.query}`,
            remove: () => change({ ...view, query: "" }),
          },
        ]
      : []),
    ...(view.due !== "any"
      ? [
          {
            label: `Due: ${view.due}`,
            remove: () => change({ ...view, due: "any" }),
          },
        ]
      : []),
    ...(view.execution !== "any"
      ? [
          {
            label:
              view.execution === "linked" ? "Has execution" : "No execution",
            remove: () => change({ ...view, execution: "any" }),
          },
        ]
      : []),
    ...(view.blocked
      ? [
          {
            label: "Blocked by dependencies",
            remove: () => change({ ...view, blocked: false }),
          },
        ]
      : []),
  ];
  return (
    <div className="mc-filter-chips" aria-label="Active filters">
      {chips.map((chip, index) => (
        <button
          className="mc-chip"
          disabled={busy}
          key={`${index}-${chip.label}`}
          onClick={chip.remove}
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label}
          <X size={12} />
        </button>
      ))}
    </div>
  );
}

export function Checklist({
  task,
  update,
  busy,
}: {
  task: Task;
  update: (checklist: Task["checklist"]) => void;
  busy: boolean;
}) {
  if (!task.checklist.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return (
    <section className="mc-checklist">
      <h3>
        Acceptance checklist
        <span>
          {done}/{task.checklist.length}
        </span>
      </h3>
      <progress
        aria-label="Acceptance checklist progress"
        value={done}
        max={task.checklist.length}
      />
      {task.checklist.map((item) => (
        <label className="mc-checklist-item" key={item.id}>
          <input
            type="checkbox"
            checked={item.done}
            disabled={busy}
            onChange={() =>
              update(
                task.checklist.map((current) =>
                  current.id === item.id
                    ? { ...current, done: !current.done }
                    : current,
                ),
              )
            }
          />
          <span>{item.text}</span>
        </label>
      ))}
    </section>
  );
}

export function NotesActivity({
  detail,
  addNote,
  older,
  busy,
}: {
  detail: TaskDetail;
  addNote: (text: string) => Promise<boolean>;
  older: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <section className="mc-notes">
      <h3>Notes & activity</h3>
      <form
        className="mc-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim())
            void addNote(text.trim()).then((saved) => {
              if (saved) setText("");
            });
        }}
      >
        <label>
          Add a note
          <textarea
            value={text}
            maxLength={4000}
            placeholder="A decision, a blocker, or context for the next agent…"
            rows={3}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button disabled={busy || !text.trim()}>Add note</button>
      </form>
      <ol className="mc-activity">
        {detail.activity.map((event) => (
          <li className="mc-activity-item" key={event.id}>
            <div>
              <strong>{event.summary}</strong>
              <time dateTime={new Date(event.createdAt).toISOString()}>
                {timestamp(event.createdAt)}
              </time>
            </div>
            {event.text && <p>{event.text}</p>}
          </li>
        ))}
      </ol>
      {detail.activityCursor && (
        <button disabled={busy} onClick={older}>
          Older activity
        </button>
      )}
    </section>
  );
}

type Command = { id: string; label: string; detail?: string; run: () => void };
export function CommandPalette({
  commands,
  close,
}: {
  commands: Command[];
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = commands.filter((command) =>
    `${command.label} ${command.detail ?? ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <Modal title="Go anywhere. Make things happen." close={close}>
      <label className="mc-palette-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Find a command"
          placeholder="Search actions, projects, views, and loaded tasks…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-mc-draft="ignore"
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              close();
              matches[0].run();
            }
          }}
        />
      </label>
      <div className="mc-command-results">
        {matches.map((command) => (
          <button
            className="mc-command-item"
            aria-label={`${command.label}${command.detail ? ` · ${command.detail}` : ""}`}
            key={command.id}
            onClick={() => {
              close();
              command.run();
            }}
          >
            <span>
              {command.label}
              <small>{command.detail}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {!matches.length && (
          <div className="mc-empty">
            <Orbit size={25} />
            <h3>No matching commands.</h3>
            <p>Try a project name or an action such as “New task”.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
