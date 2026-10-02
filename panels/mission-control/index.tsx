import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDurableObjectServiceClient,
  openPanel,
} from "@workspace/runtime";
import {
  Orbit,
  Plus,
  Search,
  Columns3,
  List,
  ArrowUpRight,
  Play,
  Square,
  X,
  GitBranch,
  Sparkles,
  Clock3,
  SlidersHorizontal,
  Bookmark,
  ChevronRight,
  Check,
  RefreshCw,
  ArrowLeft,
  Tag,
  CalendarClock,
  Folder,
  Inbox,
  CircleCheck,
  CircleDot,
  MoreHorizontal,
} from "@workspace/ui/icons";
import {
  PROTOCOL,
  STATUSES,
  STATUS_LABELS,
  PRIORITIES,
  emptyView,
  type Overview,
  type Project,
  type Task,
  type View,
  type TaskInput,
  type TaskDetail,
  type Session,
  type SavedView,
} from "@workspace/mission-control";
import {
  Modal,
  ProjectForm,
  TaskForm,
  ScheduleForm,
  Filters,
  ModalCloseButton,
} from "./forms";
import {
  TaskCard,
  RunRow,
  TaskList,
  Agenda,
  FilterChips,
  Checklist,
  NotesActivity,
  CommandPalette,
  dueLabel,
} from "./components";
import "./styles.css";

const service = createDurableObjectServiceClient(PROTOCOL);
type Operation =
  | "overview"
  | "taskOptions"
  | "taskDetail"
  | "getTask"
  | "createProject"
  | "updateProject"
  | "createTask"
  | "updateTask"
  | "cancelTask"
  | "startTask"
  | "controlTask"
  | "configureAutomation"
  | "setView"
  | "saveView"
  | "removeView"
  | "lead"
  | "duplicateTask"
  | "addNote";
const call = <T,>(method: Operation, input?: unknown) =>
  service.call<T>(method, ...(input === undefined ? [] : [input]));
const relative = (time: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
const mergeBy = <T,>(items: T[], key: (item: T) => string) => [
  ...new Map(items.map((item) => [key(item), item])).values(),
];
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function MissionControl() {
  const [data, setData] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | "project"
    | "task"
    | "filters"
    | "schedule"
    | "save-view"
    | "archives"
    | "commands"
    | "shortcuts"
    | null
  >(null);
  const [savedView, setSavedView] = useState<SavedView | undefined>();
  const [capture, setCapture] = useState("");
  const [captureProject, setCaptureProject] = useState("");
  const [noteReset, setNoteReset] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const [editProject, setEditProject] = useState<Project | undefined>();
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [defaultStatus, setDefaultStatus] = useState<Task["status"]>("inbox");
  const [detailError, setDetailError] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const busy = pending.has("workspace");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{
    title: string;
    id: string;
    expectedRevision: number;
    changes: Partial<TaskInput>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [idea, setIdea] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConversation, setShowConversation] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const focused = useRef<string | null>(null);
  const queryDraft = useRef({ value: "", dirty: false });
  const loaded = useRef({ view: "", tasks: 0, runs: 0, activity: 0 });
  const operations = useRef(new Set<string>());
  const refreshing = useRef(false);
  const inspectorOpener = useRef<HTMLElement | null>(null);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusedId)
      inspector.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [focusedId]);
  const readDetail = useCallback(async (id: string) => {
    const version = ++detailRequest.current;
    try {
      let result = await call<TaskDetail>("taskDetail", { id });
      const capacity = loaded.current.runs;
      while (
        result.cursor &&
        result.runs.length < capacity &&
        focused.current === id &&
        version === detailRequest.current
      ) {
        const page = await call<TaskDetail>("taskDetail", {
          id,
          cursor: result.cursor,
        });
        result = {
          ...page,
          runs: mergeBy([...result.runs, ...page.runs], (run) => run.runId),
        };
      }
      while (
        result.activityCursor &&
        result.activity.length < loaded.current.activity &&
        focused.current === id &&
        version === detailRequest.current
      ) {
        const page = await call<TaskDetail>("taskDetail", {
          id,
          activityCursor: result.activityCursor,
        });
        result = {
          ...result,
          activityCursor: page.activityCursor,
          activity: mergeBy(
            [...result.activity, ...page.activity],
            (event) => event.id,
          ),
        };
      }
      if (focused.current === id && version === detailRequest.current) {
        loaded.current.activity = result.activity.length;
        setDetail(result);
        setDetailError("");
        setShowConversation(result.task.historyMode === "conversation");
        loaded.current.runs = result.runs.length;
      }
    } catch (error) {
      if (focused.current === id && version === detailRequest.current)
        setDetailError(message(error));
      throw error;
    }
  }, []);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    let result = await call<Overview>("overview", {});
    const viewKey = JSON.stringify(result.view);
    const capacity = loaded.current.view === viewKey ? loaded.current.tasks : 0;
    while (
      result.cursor &&
      result.tasks.length < capacity &&
      version === request.current
    ) {
      const page = await call<Overview>("overview", { cursor: result.cursor });
      if (JSON.stringify(page.view) !== viewKey) return;
      result = {
        ...page,
        tasks: mergeBy([...result.tasks, ...page.tasks], (task) => task.id),
        dependencySummaries: {
          ...result.dependencySummaries,
          ...page.dependencySummaries,
        },
      };
    }
    if (version !== request.current) return;
    loaded.current.view = viewKey;
    loaded.current.tasks = result.tasks.length;
    setData(result);
    setUndo((previous) => {
      const task =
        previous && result.tasks.find((task) => task.id === previous.id);
      return task && task.revision !== previous!.expectedRevision
        ? null
        : previous;
    });
    setSelected(
      (old) =>
        new Set(
          [...old].filter((id) => result.tasks.some((task) => task.id === id)),
        ),
    );
    if (!queryDraft.current.dirty) {
      setQuery(result.view.query);
      queryDraft.current.value = result.view.query;
    }
    const id = focused.current;
    if (id) await readDetail(id).catch(() => {});
  }, [readDetail]);
  useEffect(() => {
    let active = true;
    const update = async () => {
      if (
        !active ||
        document.visibilityState !== "visible" ||
        refreshing.current
      )
        return;
      refreshing.current = true;
      try {
        await refresh();
      } catch (error) {
        if (active) setError(message(error));
      } finally {
        refreshing.current = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      request.current++;
      detailRequest.current++;
    };
  }, [refresh]);
  const closeDetail = () => {
    focused.current = null;
    detailRequest.current++;
    setFocusedId(null);
    setDetail(null);
    setDetailError("");
    inspectorOpener.current?.isConnected && inspectorOpener.current.focus();
  };
  const act = async (
    work: () => Promise<unknown>,
    success?: string,
    reload = true,
    scopeKey = "workspace",
  ) => {
    // Ownership lasts until this exact command settles. Independent launches,
    // conversations and planning commands must not block each other.
    if (operations.current.has(scopeKey)) return false;
    operations.current.add(scopeKey);
    setPending(new Set(operations.current));
    request.current++;
    detailRequest.current++;
    setError("");
    setNotice("");
    try {
      await work();
      if (success) setNotice(success);
      if (reload) {
        try {
          await refresh();
        } catch (error) {
          setError(
            `Operation completed, but the view could not refresh: ${message(error)}`,
          );
        }
      }
      return true;
    } catch (error) {
      setError(message(error));
      if (reload) await refresh().catch(() => {});
      return false;
    } finally {
      operations.current.delete(scopeKey);
      setPending(new Set(operations.current));
    }
  };
  const commandsReady = data !== null && !busy;
  const executionBusy = (id: string) =>
    ["start", "cancel", "schedule", "control"].some((operation) =>
      pending.has(`${operation}:${id}`),
    );
  const view = data?.view ?? emptyView();
  const calendarZone =
    view.due === "any"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : view.timezone;
  const project = data?.projects.find(
    (project) => project.id === view.projectId,
  );
  const activeProjects =
    data?.projects.filter((project) => !project.archived) ?? [];
  const quickProjectId = activeProjects.some(
    (project) => project.id === captureProject,
  )
    ? captureProject
    : (activeProjects[0]?.id ?? "");
  const setView = (next: View) => {
    if (!data) return;
    void act(async () => {
      queryDraft.current = { value: next.query, dirty: false };
      setQuery(next.query);
      await call("setView", next);
    });
  };
  const focusTask = (task: Task) => {
    if (!focused.current && document.activeElement instanceof HTMLElement)
      inspectorOpener.current = document.activeElement;
    focused.current = task.id;
    loaded.current.runs = 0;
    loaded.current.activity = 0;
    setNoteReset((value) => value + 1);
    setFocusedId(task.id);
    setDetail(null);
    setDetailError("");
    setShowConversation(task.historyMode === "conversation");
    void readDetail(task.id).catch(() => {});
  };
  const newTask = (status: Task["status"] = "inbox") => {
    if (!data || operations.current.has("workspace")) return;
    setDefaultStatus(status);
    if (!data.projects.some((project) => !project.archived)) {
      setEditProject(undefined);
      setModal("project");
    } else {
      setEditTask(undefined);
      setModal("task");
    }
  };
  const updatePlanning = async (task: Task, changes: Partial<TaskInput>) => {
    const updated = await call<Task>("updateTask", {
      id: task.id,
      expectedRevision: task.revision,
      changes,
    });
    setUndo({
      title: updated.title,
      id: task.id,
      expectedRevision: updated.revision,
      changes: Object.fromEntries(
        Object.keys(changes).map((field) => [field, task[field as keyof Task]]),
      ) as Partial<TaskInput>,
    });
    return updated;
  };
  const changeTask = (task: Task, status: Task["status"]) => {
    const change = () =>
      act(
        () =>
          status === "cancelled"
            ? call("cancelTask", {
                id: task.id,
                expectedRevision: task.revision,
              })
            : updatePlanning(task, { status }),
        `Task moved to ${STATUS_LABELS[status]}`,
        true,
        status === "cancelled" ? `cancel:${task.id}` : "workspace",
      );
    if (status === "cancelled" && task.status !== "cancelled")
      setConfirmation({
        title: "Cancel this task?",
        description:
          "Future occurrences will pause. Any admitted agent work is interrupted and joined before this card becomes Cancelled. Its conversations and history remain available.",
        action: change,
      });
    else void change();
  };
  const startTask = (task: Task) =>
    void act(
      async () => {
        if (focused.current !== task.id) focusTask(task);
        const run = await call<Session>("startTask", {
          id: task.id,
          expectedRevision: task.revision,
        });
        if (run.outcome === "skipped")
          throw new Error(
            run.failure?.message ??
              "An execution is already in progress; open its history.",
          );
      },
      "Agent session started. Follow it in task history.",
      true,
      `start:${task.id}`,
    );
  const openRun = (run: Session) =>
    act(
      async () => {
        if (!run.channelId || !run.contextId)
          throw new Error("Conversation is still being prepared.");
        await openPanel("panels/chat", {
          contextId: run.contextId,
          stateArgs: { channelName: run.channelId },
        });
      },
      undefined,
      false,
      `chat:${run.runId}`,
    );
  const openLead = (prompt?: string) =>
    act(
      async () => {
        const lead = await call<{ channelId: string; contextId: string }>(
          "lead",
        );
        await openPanel("panels/chat", {
          contextId: lead.contextId,
          stateArgs: {
            channelName: lead.channelId,
            ...(prompt
              ? {
                  initialPrompt: prompt,
                  forceInitialPrompt: true,
                  initialPromptIdempotencyKey: crypto.randomUUID(),
                }
              : {}),
          },
        });
        setIdea("");
      },
      undefined,
      false,
      "lead",
    );
  const activeFilters =
    view.statuses.length +
    view.priorities.length +
    (view.tag ? 1 : 0) +
    (view.category ? 1 : 0) +
    (view.due !== "any" ? 1 : 0) +
    (view.execution !== "any" ? 1 : 0) +
    (view.blocked ? 1 : 0);
  const saveTask = (input: TaskInput) =>
    void act(
      async () => {
        if (editTask) await updatePlanning(editTask, input);
        else await call("createTask", input);
        setModal(null);
      },
      editTask ? "Task updated" : "Task added to the mission",
    );
  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkUpdate = (changes: Partial<TaskInput>, tag?: string) => {
    const run = () =>
      act(async () => {
        const failures: string[] = [];
        const remaining = new Set<string>();
        const ids = [...selected];
        for (const id of ids) {
          try {
            const task = await call<Task>("getTask", { id });
            await call(
              changes.status === "cancelled" ? "cancelTask" : "updateTask",
              {
                id,
                expectedRevision: task.revision,
                ...(changes.status === "cancelled"
                  ? {}
                  : {
                      changes: {
                        ...changes,
                        ...(tag
                          ? { tags: [...new Set([...task.tags, tag])] }
                          : {}),
                      },
                    }),
              },
            );
          } catch (error) {
            remaining.add(id);
            failures.push(message(error));
          }
        }
        setSelected(remaining);
        if (failures.length)
          throw new Error(
            `${ids.length - failures.length} updated; ${failures.length} could not be updated: ${failures.join("; ")}`,
          );
        setNotice(`${ids.length} task${ids.length === 1 ? "" : "s"} updated.`);
      });
    if (changes.status === "cancelled")
      setConfirmation({
        title: `Cancel ${selected.size} tasks?`,
        description:
          "Their schedules will pause and live executions will be interrupted and joined. Run history is retained.",
        action: run,
      });
    else void run();
  };
  const exportTasks = () =>
    void act(
      async () => {
        const snapshot = JSON.stringify(view);
        let page = await call<Overview>("overview", {});
        const tasks: Task[] = [];
        for (;;) {
          if (JSON.stringify(page.view) !== snapshot)
            throw new Error(
              "The shared view changed during export. Review the current view and export again.",
            );
          tasks.push(...page.tasks);
          if (!page.cursor) break;
          page = await call<Overview>("overview", { cursor: page.cursor });
        }
        const cell = (value: unknown) => {
          const text = String(value ?? "");
          return (
            '"' +
            (/^[=+@-]/.test(text) ? "'" : "") +
            text.replaceAll('"', '""') +
            '"'
          );
        };
        const csv = [
          [
            "ID",
            "Project",
            "Task",
            "Status",
            "Priority",
            "Category",
            "Tags",
            "Due",
            "Brief",
          ],
          ...tasks.map((task) => [
            task.id,
            data?.projects.find((project) => project.id === task.projectId)
              ?.name,
            task.title,
            STATUS_LABELS[task.status],
            task.priority,
            task.category,
            task.tags.join(", "),
            task.dueAt === null ? "" : new Date(task.dueAt).toISOString(),
            task.description,
          ]),
        ]
          .map((row) => row.map(cell).join(","))
          .join("\r\n");
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
        try {
          const link = document.createElement("a");
          link.href = url;
          link.download = "mission-control.csv";
          link.click();
        } finally {
          URL.revokeObjectURL(url);
        }
        setNotice(
          `Exported ${tasks.length} tasks from the complete filtered view.`,
        );
      },
      undefined,
      false,
      "export",
    );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (commandsReady) setModal("commands");
        return;
      }
      if (
        (event.target as HTMLElement).matches(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key === "?" && commandsReady) {
        event.preventDefault();
        setModal("shortcuts");
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && commandsReady) {
        if (event.key.toLowerCase() === "n") newTask();
        if (event.key.toLowerCase() === "p") {
          setEditProject(undefined);
          setModal("project");
        }
      }
      if (event.key === "Escape") {
        closeDetail();
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  const commands = [
    {
      id: "new-task",
      label: "New task",
      detail: "N · give an agent a clear mission",
      run: () => newTask(),
    },
    {
      id: "new-project",
      label: "New project",
      detail: "P · connect workspace repositories",
      run: () => {
        setEditProject(undefined);
        setModal("project");
      },
    },
    {
      id: "lead",
      label: "Talk to mission lead",
      detail: "Turn flowing ideas into organized work",
      run: () => void openLead(),
    },
    {
      id: "search",
      label: "Search tasks",
      detail: "/ · search the complete task store",
      run: () => search.current?.focus(),
    },
    {
      id: "filters",
      label: "Filter your work",
      detail: "Status, priority, due dates and blockers",
      run: () => setModal("filters"),
    },
    ...(data?.projects
      .filter((project) => !project.archived)
      .map((project) => ({
        id: project.id,
        label: project.name,
        detail: "Project",
        run: () =>
          setView({
            ...emptyView(),
            projectId: project.id,
            layout: view.layout,
          }),
      })) ?? []),
    ...(data?.views.map((saved) => ({
      id: saved.id,
      label: saved.name,
      detail: "Saved view",
      run: () => setView(saved.view),
    })) ?? []),
    ...(data?.tasks.map((task) => ({
      id: task.id,
      label: task.title,
      detail: `Task · ${STATUS_LABELS[task.status]}`,
      run: () => focusTask(task),
    })) ?? []),
  ];

  return (
    <div className="mc-app">
      <aside className="mc-sidebar">
        <a
          className="mc-brand"
          href="#"
          aria-disabled={!commandsReady}
          onClick={(event) => {
            event.preventDefault();
            setView({ ...emptyView(), layout: view.layout });
          }}
        >
          <span className="mc-brand-symbol">
            <Orbit size={22} />
          </span>
          <span>
            Mission Control<small>WORKSPACE COMMAND CENTER</small>
          </span>
        </a>
        <div className="mc-space-label">
          Your workspace{" "}
          <span className="mc-healthy">
            <i />
            {data ? "Loaded" : "Loading"}
          </span>
        </div>
        <button
          disabled={!commandsReady}
          aria-current={
            data && !view.projectId && !activeFilters && !view.query
              ? "page"
              : undefined
          }
          className={`mc-nav ${data && !view.projectId && !activeFilters && !view.query ? "mc-nav-active" : ""}`}
          onClick={() => setView({ ...emptyView(), layout: view.layout })}
        >
          <Columns3 size={16} />
          All missions
          <span>
            {!view.projectId
              ? data
                ? Object.values(data.counts).reduce((a, b) => a + b, 0)
                : "—"
              : null}
          </span>
        </button>
        <button
          disabled={!commandsReady}
          aria-pressed={Boolean(
            data &&
            !view.projectId &&
            view.statuses.length === 1 &&
            view.statuses[0] === "inbox",
          )}
          className={`mc-nav ${data && !view.projectId && view.statuses.length === 1 && view.statuses[0] === "inbox" ? "mc-nav-active" : ""}`}
          onClick={() =>
            setView({
              ...emptyView(),
              layout: view.layout,
              statuses: ["inbox"],
            })
          }
        >
          <Inbox size={16} />
          Idea inbox
          <span>{!view.projectId ? (data?.counts.inbox ?? "—") : null}</span>
        </button>
        <button
          disabled={!commandsReady}
          aria-pressed={Boolean(
            data &&
            !view.projectId &&
            view.statuses.length === 1 &&
            view.statuses[0] === "review",
          )}
          className={`mc-nav ${data && !view.projectId && view.statuses.length === 1 && view.statuses[0] === "review" ? "mc-nav-active" : ""}`}
          onClick={() =>
            setView({
              ...emptyView(),
              layout: view.layout,
              statuses: ["review"],
            })
          }
        >
          <CircleCheck size={16} />
          Needs your eyes
          <span>{!view.projectId ? (data?.counts.review ?? "—") : null}</span>
        </button>
        <div className="mc-sidebar-heading">
          PROJECTS
          <button
            className="mc-icon"
            aria-label="Create project"
            disabled={!commandsReady}
            onClick={() => {
              setEditProject(undefined);
              setModal("project");
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="mc-project-nav">
          {data?.projects
            .filter((project) => !project.archived)
            .map((project) => (
              <button
                disabled={!commandsReady}
                aria-current={
                  view.projectId === project.id ? "page" : undefined
                }
                className={`mc-nav ${view.projectId === project.id ? "mc-nav-active" : ""}`}
                key={project.id}
                onClick={() =>
                  setView({
                    ...emptyView(),
                    projectId: project.id,
                    layout: view.layout,
                  })
                }
              >
                <span className={`mc-project-dot mc-color-${project.color}`} />
                {project.name}
                <ChevronRight size={13} />
              </button>
            ))}
          {data && !data.projects.some((project) => !project.archived) && (
            <p className="mc-sidebar-empty">Your first project starts here.</p>
          )}
        </div>
        <button
          className="mc-nav mc-add-project"
          disabled={!commandsReady}
          onClick={() => {
            setEditProject(undefined);
            setModal("project");
          }}
        >
          <Plus size={14} />
          New project
        </button>
        <button
          className="mc-nav"
          disabled={!commandsReady}
          onClick={() => setModal("archives")}
        >
          <Folder size={14} />
          Archived projects
          <span>
            {data?.projects.filter((project) => project.archived).length ?? "—"}
          </span>
        </button>
        <div className="mc-sidebar-heading">
          SAVED VIEWS
          <Bookmark size={12} />
        </div>
        {data?.views.map((saved) => (
          <div className="mc-saved-view" key={saved.id}>
            <button
              className="mc-nav"
              aria-current={
                JSON.stringify(view) === JSON.stringify(saved.view)
                  ? "page"
                  : undefined
              }
              disabled={!commandsReady}
              onClick={() => setView(saved.view)}
            >
              <Bookmark size={14} />
              {saved.name}
            </button>
            <button
              className="mc-icon"
              aria-label={`Edit saved view ${saved.name}`}
              title="Rename or replace this view"
              disabled={!commandsReady}
              onClick={() => {
                setSavedView(saved);
                setModal("save-view");
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
        {data && !data.views.length && (
          <p className="mc-sidebar-empty">Save a useful slice of your work.</p>
        )}
        <div className="mc-sidebar-bottom">
          <div className="mc-lead-avatar">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Mission lead</strong>
            <small>Ideas → organized action</small>
          </div>
          <button
            className="mc-icon"
            aria-label="Open mission lead conversation"
            onClick={() => void openLead()}
            disabled={!commandsReady || pending.has("lead")}
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
      </aside>
      <main className="mc-main" aria-busy={busy}>
        <header className="mc-topbar">
          <div className="mc-breadcrumb">
            <Orbit size={14} /> Workspace <ChevronRight size={12} />
            <span>{project?.name ?? "All missions"}</span>
          </div>
          <div className="mc-topbar-actions">
            <button
              className="mc-icon"
              aria-label="Open command menu"
              title="Commands · Ctrl/⌘ K"
              disabled={!commandsReady}
              onClick={() => setModal("commands")}
            >
              <Search size={16} />
            </button>
            <button
              className="mc-icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts · ?"
              disabled={!commandsReady}
              onClick={() => setModal("shortcuts")}
            >
              <kbd>?</kbd>
            </button>
            <button
              className="mc-icon"
              aria-label="Refresh mission control"
              disabled={busy}
              onClick={() => void act(async () => {}, undefined)}
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="mc-lead-button"
              disabled={!commandsReady || pending.has("lead")}
              onClick={() => void openLead()}
            >
              <Sparkles size={14} />
              Talk to mission lead
              <ArrowUpRight size={13} />
            </button>
          </div>
        </header>
        <div className="mc-heading">
          <div>
            <div className="mc-eyebrow">
              A LITTLE CLARITY. A LOT OF MOMENTUM.
            </div>
            <h1>{project?.name ?? "Make room for what’s next."}</h1>
            <p>
              {project?.description ||
                "A clear view of your ideas, your agents, and the work moving forward."}
            </p>
            {project?.repos.length ? (
              <div className="mc-heading-repos">
                <GitBranch size={13} />
                {project.repos.map((repo) => (
                  <code key={repo}>{repo}</code>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mc-heading-actions">
            {project && (
              <button
                className="mc-icon"
                aria-label={`Edit project ${project.name}`}
                disabled={!commandsReady}
                onClick={() => {
                  setEditProject(project);
                  setModal("project");
                }}
              >
                <MoreHorizontal size={19} />
              </button>
            )}
            <button
              className="mc-primary"
              onClick={() => newTask()}
              disabled={!commandsReady}
            >
              <Plus size={16} />
              New task
            </button>
          </div>
        </div>
        <section className="mc-stats" aria-label="Mission overview">
          {(
            [
              {
                title: "In motion",
                value: data?.counts.active,
                icon: Play,
                status: "active",
                color: "violet",
                sub: "Tasks underway",
              },
              {
                title: "Ready for takeoff",
                value: data?.counts.ready,
                icon: CircleDot,
                status: "ready",
                color: "blue",
                sub: "Clear next steps",
              },
              {
                title: "Needs your eyes",
                value: data?.counts.review,
                icon: CircleCheck,
                status: "review",
                color: "amber",
                sub: "Ready for a human touch",
              },
              {
                title: "Mission complete",
                value: data?.counts.done,
                icon: Check,
                status: "done",
                color: "green",
                sub: "Accepted and delivered",
              },
            ] as const
          ).map((stat) => (
            <button
              className="mc-stat"
              disabled={!commandsReady}
              key={stat.status}
              onClick={() => setView({ ...view, statuses: [stat.status] })}
            >
              <div>
                <span>{stat.title}</span>
                <strong>{stat.value ?? "—"}</strong>
                <small>{stat.sub}</small>
              </div>
              <span className={`mc-stat-icon mc-color-${stat.color}`}>
                <stat.icon size={18} />
              </span>
            </button>
          ))}
        </section>
        <section className="mc-command">
          <div className="mc-command-icon">
            <Sparkles size={20} />
          </div>
          <div className="mc-command-copy">
            <strong>Big idea? Messy thought? Start here.</strong>
            <span>Your mission lead turns a conversation into a plan.</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (commandsReady && idea.trim()) void openLead(idea);
            }}
          >
            <input
              aria-label="Idea for mission lead"
              disabled={!commandsReady}
              placeholder="What’s on your mind?"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              maxLength={16000}
            />
            <button
              className="mc-icon"
              aria-label="Send idea to mission lead"
              disabled={!commandsReady || pending.has("lead") || !idea.trim()}
            >
              <ArrowUpRight size={18} />
            </button>
          </form>
        </section>
        {pending.size > 0 && !busy && (
          <div className="mc-operation-status" role="status">
            <CircleDot size={14} />
            {pending.size} operation{pending.size === 1 ? "" : "s"} in progress.
            Planning stays available.
          </div>
        )}
        {error && (
          <div className="mc-banner mc-error" role="alert">
            <span>{error}</span>
            <button
              className="mc-icon"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {(notice || undo) && (
          <div className="mc-banner" role="status">
            <span>
              <Check size={14} />
              {notice || "Card updated"}
            </span>
            {undo && (
              <button
                disabled={!commandsReady}
                onClick={() =>
                  void act(async () => {
                    const { title: _title, ...input } = undo;
                    await call("updateTask", input);
                    setUndo(null);
                  }, "Last card edit undone")
                }
              >
                Undo edit: {undo.title}
              </button>
            )}
            <button
              className="mc-icon"
              onClick={() => {
                setNotice("");
                setUndo(null);
              }}
              aria-label="Dismiss notice"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="mc-board-toolbar">
          <div className="mc-board-title">
            <h2>
              {view.statuses.length === 1
                ? STATUS_LABELS[view.statuses[0]!]
                : "The mission board"}
            </h2>
            <span>
              {data?.total ?? "—"} {data?.total === 1 ? "task" : "tasks"}
            </span>
          </div>
          <div className="mc-tools">
            <form
              className="mc-search"
              onSubmit={(event) => {
                event.preventDefault();
                setView({ ...view, query });
              }}
            >
              <Search size={14} />
              <input
                ref={search}
                aria-label="Search tasks"
                disabled={!commandsReady}
                value={query}
                placeholder="Search tasks…"
                maxLength={200}
                onChange={(event) => {
                  queryDraft.current = {
                    value: event.target.value,
                    dirty: true,
                  };
                  setQuery(event.target.value);
                }}
              />
              <kbd>/</kbd>
              {query && (
                <button
                  type="button"
                  className="mc-icon"
                  aria-label="Clear search"
                  disabled={!commandsReady}
                  onClick={() => setView({ ...view, query: "" })}
                >
                  <X size={12} />
                </button>
              )}
              <button
                className="mc-icon"
                aria-label="Apply search"
                disabled={!commandsReady}
              >
                <ChevronRight size={12} />
              </button>
            </form>
            <button
              disabled={!commandsReady}
              className={activeFilters ? "mc-filter-active" : ""}
              onClick={() => setModal("filters")}
            >
              <SlidersHorizontal size={14} />
              Filter{activeFilters ? ` · ${activeFilters}` : ""}
            </button>
            <button
              className="mc-icon"
              aria-label="Save current view"
              disabled={!commandsReady}
              onClick={() => {
                setSavedView(undefined);
                setModal("save-view");
              }}
            >
              <Bookmark size={15} />
            </button>
            <button
              disabled={!commandsReady || pending.has("export") || !data?.total}
              onClick={exportTasks}
            >
              Export CSV
            </button>
            <select
              aria-label="Sort tasks"
              disabled={!commandsReady}
              value={view.sort}
              onChange={(event) =>
                setView({ ...view, sort: event.target.value as View["sort"] })
              }
            >
              <option value="priority">Priority</option>
              <option value="updated">Recently updated</option>
              <option value="due">Due date</option>
            </select>
            <div className="mc-layout-toggle">
              <button
                aria-label="Board view"
                disabled={!commandsReady}
                aria-pressed={view.layout === "board"}
                onClick={() => setView({ ...view, layout: "board" })}
              >
                <Columns3 size={15} />
              </button>
              <button
                aria-label="List view"
                disabled={!commandsReady}
                aria-pressed={view.layout === "list"}
                onClick={() => setView({ ...view, layout: "list" })}
              >
                <List size={16} />
              </button>
              <button
                aria-label="Agenda view"
                title="Tasks by due date"
                disabled={!commandsReady}
                aria-pressed={view.layout === "agenda"}
                onClick={() => setView({ ...view, layout: "agenda" })}
              >
                <CalendarClock size={16} />
              </button>
            </div>
          </div>
        </div>
        {data && data.projects.some((project) => !project.archived) && (
          <form
            className="mc-quick-capture"
            onSubmit={(event) => {
              event.preventDefault();
              const projectId = view.projectId ?? quickProjectId;
              if (!projectId || !capture.trim()) return;
              void act(
                () =>
                  call("createTask", {
                    projectId,
                    title: capture.trim(),
                    status: "inbox",
                  }),
                "Idea captured in Inbox",
              ).then((saved) => {
                if (saved) setCapture("");
              });
            }}
          >
            <Plus size={15} />
            <input
              aria-label="Quick task title"
              disabled={!commandsReady}
              value={capture}
              maxLength={200}
              placeholder="Capture a task without leaving your flow…"
              onChange={(event) => setCapture(event.target.value)}
            />
            {!view.projectId && (
              <select
                aria-label="Quick capture project"
                disabled={!commandsReady}
                value={quickProjectId}
                onChange={(event) => setCaptureProject(event.target.value)}
              >
                {data.projects
                  .filter((project) => !project.archived)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            )}
            <button
              aria-label="Capture task"
              disabled={!commandsReady || !capture.trim()}
            >
              Capture<kbd aria-hidden="true">↵</kbd>
            </button>
          </form>
        )}
        {data && data.tasks.length > 0 && (
          <div className="mc-selection-control">
            <label>
              <input
                type="checkbox"
                disabled={!commandsReady}
                checked={data.tasks.every((task) => selected.has(task.id))}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? new Set(data.tasks.map((task) => task.id))
                      : new Set(),
                  )
                }
              />
              Select {data.tasks.length} loaded tasks
            </label>
            {data.cursor && <span>Load more to include additional cards.</span>}
          </div>
        )}
        {selected.size > 0 && (
          <div
            className="mc-bulk"
            role="region"
            aria-label="Selected task actions"
          >
            <strong>{selected.size} selected</strong>
            <select
              aria-label="Move selected tasks"
              defaultValue=""
              disabled={!commandsReady}
              onChange={(event) => {
                if (event.target.value)
                  bulkUpdate({ status: event.target.value as Task["status"] });
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Move to…
              </option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              aria-label="Set selected priority"
              defaultValue=""
              disabled={!commandsReady}
              onChange={(event) => {
                if (event.target.value)
                  bulkUpdate({
                    priority: event.target.value as Task["priority"],
                  });
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Priority…
              </option>
              {PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
            <select
              aria-label="Move selected project"
              defaultValue=""
              disabled={!commandsReady}
              onChange={(event) => {
                if (event.target.value)
                  bulkUpdate({ projectId: event.target.value });
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Project…
              </option>
              {data?.projects
                .filter((project) => !project.archived)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const tag = String(new FormData(form).get("tag")).trim();
                if (tag) bulkUpdate({}, tag);
              }}
            >
              <input
                name="tag"
                aria-label="Tag selected tasks"
                maxLength={40}
                placeholder="Add tag…"
              />
              <button disabled={!commandsReady}>Tag</button>
            </form>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        {data && (activeFilters > 0 || view.query) && (
          <div className="mc-filter-summary">
            <FilterChips view={view} busy={!commandsReady} change={setView} />
            <button
              disabled={!commandsReady}
              onClick={() =>
                setView({
                  ...emptyView(),
                  projectId: view.projectId,
                  layout: view.layout,
                })
              }
            >
              Clear filters
            </button>
          </div>
        )}
        {!data ? (
          <div className="mc-empty" role="status">
            <Orbit size={35} />
            <h3>
              {error
                ? "Couldn’t load your missions."
                : "Gathering your missions…"}
            </h3>
            <p>
              {error
                ? "Refresh to try loading this workspace again."
                : "Loading your projects, tasks, and saved views."}
            </p>
          </div>
        ) : !data.projects.some((project) => !project.archived) ? (
          <div className="mc-empty">
            <span className="mc-empty-orbit">
              <Orbit size={46} />
            </span>
            <div className="mc-eyebrow">
              EVERY GREAT MISSION STARTS WITH AN IDEA
            </div>
            <h3>Your next chapter starts here.</h3>
            <p>
              Create a project, connect its repositories, and give your first
              task to an agent.
              <br />
              Or talk it through with your mission lead.
            </p>
            <button
              className="mc-primary"
              disabled={!commandsReady}
              onClick={() => {
                setEditProject(undefined);
                setModal("project");
              }}
            >
              <Plus size={16} />
              Create your first project
            </button>
          </div>
        ) : view.layout === "board" ? (
          <div className="mc-board">
            {STATUSES.filter(
              (status) =>
                (!view.statuses.length || view.statuses.includes(status)) &&
                (status !== "cancelled" ||
                  data.tasks.some((task) => task.status === "cancelled") ||
                  view.statuses.includes("cancelled")),
            ).map((status) => (
              <section
                className={`mc-column mc-column-${status}`}
                key={status}
                aria-label={STATUS_LABELS[status]}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const task = data.tasks.find(
                    (task) =>
                      task.id === event.dataTransfer.getData("text/plain"),
                  );
                  if (task && task.status !== status && commandsReady)
                    void changeTask(task, status);
                }}
              >
                <div className="mc-column-heading">
                  <span className="mc-status-dot" />
                  <h3>{STATUS_LABELS[status]}</h3>
                  <span>
                    {data.tasks.filter((task) => task.status === status).length}
                  </span>
                  {status !== "cancelled" && (
                    <button
                      className="mc-icon"
                      aria-label={`Add task to ${STATUS_LABELS[status]}`}
                      disabled={!commandsReady}
                      onClick={() => newTask(status)}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                <div className="mc-column-cards">
                  {data.tasks
                    .filter((task) => task.status === status)
                    .map((task) => (
                      <TaskCard
                        startBusy={executionBusy(task.id)}
                        timezone={calendarZone}
                        key={task.id}
                        task={task}
                        project={data.projects.find(
                          (project) => project.id === task.projectId,
                        )}
                        dependency={data.dependencySummaries[task.id]}
                        open={() => focusTask(task)}
                        start={() => startTask(task)}
                        selected={selected.has(task.id)}
                        select={() =>
                          setSelected((old) => {
                            const next = new Set(old);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          })
                        }
                        busy={!commandsReady}
                      />
                    ))}
                  {!data.tasks.some((task) => task.status === status) && (
                    <div className="mc-column-empty">
                      <span>Clear skies here.</span>
                      <small>
                        {status === "inbox"
                          ? "Capture an idea to get started."
                          : status === "ready"
                            ? "Your next missions will land here."
                            : status === "active"
                              ? "Start an agent from a ready task."
                              : status === "review"
                                ? "Delivered work awaits your review."
                                : "Good work deserves a landing spot."}
                      </small>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : view.layout === "agenda" ? (
          <Agenda
            timezone={calendarZone}
            tasks={data.tasks}
            projects={data.projects}
            busy={!commandsReady}
            open={focusTask}
          />
        ) : (
          <TaskList
            timezone={calendarZone}
            tasks={data.tasks}
            projects={data.projects}
            selected={selected}
            toggle={toggle}
            busy={!commandsReady}
            open={focusTask}
          />
        )}
        {data &&
          data.projects.some((project) => !project.archived) &&
          !data.tasks.length && (
            <div className="mc-empty">
              <Search size={30} />
              <h3>No tasks in this view.</h3>
              <p>
                {activeFilters || view.query
                  ? "Try a different filter or clear this slice of your work."
                  : "Capture a quick idea above or give your agent a clear mission."}
              </p>
              <button
                disabled={!commandsReady}
                onClick={() =>
                  activeFilters || view.query
                    ? setView({
                        ...emptyView(),
                        projectId: view.projectId,
                        layout: view.layout,
                      })
                    : newTask()
                }
              >
                {activeFilters || view.query
                  ? "Clear filters"
                  : "Create a task"}
              </button>
            </div>
          )}

        {data?.cursor && (
          <button
            className="mc-load-more"
            disabled={!commandsReady}
            onClick={() =>
              void act(
                async () => {
                  const page = await call<Overview>("overview", {
                    cursor: data.cursor,
                  });
                  if (JSON.stringify(page.view) !== JSON.stringify(data.view)) {
                    await refresh();
                    return;
                  }
                  const tasks = mergeBy(
                    [...data.tasks, ...page.tasks],
                    (task) => task.id,
                  );
                  loaded.current.tasks = tasks.length;
                  setData({
                    ...page,
                    tasks,
                    dependencySummaries: {
                      ...data.dependencySummaries,
                      ...page.dependencySummaries,
                    },
                  });
                },
                undefined,
                false,
              )
            }
          >
            Load more tasks
          </button>
        )}
        <footer className="mc-footer">
          <span>
            <span className="mc-live-dot" />
            Shared workspace state · agent changes appear here
          </span>
          <span>
            N · new task &nbsp; / · search &nbsp; ⌘ / Ctrl K · commands
          </span>
        </footer>
      </main>
      {focusedId && (
        <aside ref={inspector} className="mc-detail" aria-label="Task details">
          <header>
            <button
              className="mc-icon"
              aria-label="Close task details"
              onClick={closeDetail}
            >
              <ArrowLeft size={18} />
            </button>
            <span>TASK BRIEF</span>
            {detail && (
              <button
                className="mc-icon"
                aria-label={`Edit ${detail.task.title}`}
                disabled={!commandsReady}
                onClick={() => {
                  setEditTask(detail.task);
                  setModal("task");
                }}
              >
                <MoreHorizontal size={19} />
              </button>
            )}
          </header>
          {!detail ? (
            detailError ? (
              <div className="mc-detail-error" role="alert">
                <p>{detailError}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() => readDetail(focusedId), undefined, false)
                  }
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="mc-help" role="status">
                Reading the task and its run history…
              </p>
            )
          ) : (
            <>
              {detailError && (
                <p className="mc-error" role="alert">
                  {detailError}
                </p>
              )}
              <div
                className={`mc-project-label mc-color-${detail.project.color}`}
              >
                <i />
                {detail.project.name}
              </div>
              <h2>{detail.task.title}</h2>
              <div className="mc-detail-meta">
                <span
                  className={`mc-priority mc-priority-${detail.task.priority}`}
                >
                  {detail.task.priority} priority
                </span>
                <span>{STATUS_LABELS[detail.task.status]}</span>
                {detail.task.dueAt !== null && (
                  <span title={relative(detail.task.dueAt)}>
                    <Clock3 size={12} />
                    {dueLabel(detail.task, calendarZone)}
                  </span>
                )}
              </div>
              <p className="mc-brief">
                {detail.task.description ||
                  "Add a brief so your agent knows what success looks like."}
              </p>
              <div className="mc-tags">
                {detail.task.tags.map((tag) => (
                  <span key={tag}>
                    <Tag size={11} />
                    {tag}
                  </span>
                ))}
              </div>
              {detail.project.repos.length > 0 && (
                <div className="mc-detail-repos">
                  <GitBranch size={13} />
                  {detail.project.repos.map((repo) => (
                    <code key={repo}>{repo}</code>
                  ))}
                </div>
              )}
              <Checklist
                task={detail.task}
                busy={!commandsReady || detail.project.archived}
                update={(checklist) =>
                  void act(
                    () => updatePlanning(detail.task, { checklist }),
                    "Checklist updated",
                  )
                }
              />
              {detail.dependencies.length > 0 && (
                <section className="mc-dependencies">
                  <h3>
                    Dependencies
                    <span>
                      {
                        detail.dependencies.filter(
                          (task) => task.status === "done",
                        ).length
                      }
                      /{detail.dependencies.length} accepted
                    </span>
                  </h3>
                  {detail.dependencies.map((task) => (
                    <button
                      className="mc-dependency"
                      disabled={!commandsReady}
                      key={task.id}
                      onClick={() => focusTask(task)}
                    >
                      <span>
                        {task.status === "done" ? (
                          <Check size={13} />
                        ) : (
                          <Clock3 size={13} />
                        )}
                        {task.title}
                      </span>
                      <small>{STATUS_LABELS[task.status]}</small>
                    </button>
                  ))}
                </section>
              )}
              <div className="mc-detail-secondary">
                {detail.task.status === "review" && (
                  <button
                    className="mc-primary"
                    disabled={!commandsReady}
                    onClick={() => changeTask(detail.task, "done")}
                  >
                    <Check size={14} />
                    Accept delivery
                  </button>
                )}
                {["done", "cancelled"].includes(detail.task.status) && (
                  <button
                    disabled={!commandsReady || detail.project.archived}
                    onClick={() => changeTask(detail.task, "ready")}
                  >
                    Reopen task
                  </button>
                )}
                <button
                  disabled={!commandsReady || detail.project.archived}
                  onClick={() =>
                    void act(async () => {
                      const duplicate = await call<Task>("duplicateTask", {
                        id: detail.task.id,
                        expectedRevision: detail.task.revision,
                      });
                      focusTask(duplicate);
                    }, "Planning card duplicated; execution history stays with the original")
                  }
                >
                  Duplicate task
                </button>
              </div>
              <div className="mc-detail-actions">
                <button
                  className="mc-primary"
                  disabled={
                    !commandsReady ||
                    executionBusy(detail.task.id) ||
                    detail.task.status === "cancelled" ||
                    (detail.task.status === "done" &&
                      (!detail.automation ||
                        detail.automation.charter.trigger.kind === "manual")) ||
                    detail.project.archived ||
                    detail.dependencies.some(
                      (task) => task.status !== "done",
                    ) ||
                    detail.runs.some((run) => run.phase !== "terminal")
                  }
                  onClick={() => startTask(detail.task)}
                >
                  <Play size={14} />
                  {pending.has(`start:${detail.task.id}`)
                    ? "Launching agent…"
                    : "Start agent"}
                </button>
                <button
                  disabled={
                    !commandsReady ||
                    detail.project.archived ||
                    detail.task.status === "cancelled"
                  }
                  onClick={() => setModal("schedule")}
                >
                  <CalendarClock size={14} />
                  Recurring
                </button>
              </div>
              <label className="mc-status-field">
                Move task
                <select
                  value={detail.task.status}
                  disabled={
                    !commandsReady || pending.has(`cancel:${detail.task.id}`)
                  }
                  onChange={(event) =>
                    void changeTask(
                      detail.task,
                      event.target.value as Task["status"],
                    )
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              {detail.automation && (
                <section className="mc-automation">
                  <h3>
                    <CalendarClock size={15} />
                    Automation<span>{detail.automation.state}</span>
                  </h3>
                  <p>
                    {detail.automation.charter.trigger.kind === "manual"
                      ? "Runs when you start it."
                      : detail.automation.charter.trigger.kind === "cron"
                        ? `${detail.automation.charter.trigger.expression} · ${detail.automation.charter.trigger.timezone}`
                        : `Every ${detail.automation.charter.trigger.everyMs / 60000} minutes`}
                  </p>
                  {detail.automation.nextRunAt && (
                    <p>Next: {relative(detail.automation.nextRunAt)}</p>
                  )}
                  <small>
                    {detail.automation.runCount} lifetime runs ·{" "}
                    {detail.automation.authority.requestIds.length} permission
                    requests · {detail.automation.authority.denialIds.length}{" "}
                    denied
                  </small>
                  <div>
                    {detail.automation.charter.trigger.kind !== "manual" && (
                      <button
                        disabled={
                          !commandsReady ||
                          detail.automation.state === "completed" ||
                          detail.automation.state === "retired" ||
                          pending.has(`control:${detail.task.id}`)
                        }
                        onClick={() =>
                          void act(
                            () =>
                              call("controlTask", {
                                id: detail.task.id,
                                action:
                                  detail.automation?.state === "paused"
                                    ? "resume"
                                    : "pause",
                              }),
                            undefined,
                            true,
                            `control:${detail.task.id}`,
                          )
                        }
                      >
                        {detail.automation.state === "paused" ? (
                          <Play size={12} />
                        ) : (
                          <Square size={12} />
                        )}
                        {detail.automation.state === "paused"
                          ? "Resume schedule"
                          : "Pause schedule"}
                      </button>
                    )}
                    <button
                      disabled={
                        !commandsReady ||
                        detail.task.status === "cancelled" ||
                        pending.has(`cancel:${detail.task.id}`)
                      }
                      onClick={() => void changeTask(detail.task, "cancelled")}
                    >
                      <Square size={12} />
                      Cancel task
                    </button>
                  </div>
                </section>
              )}
              <section className="mc-history">
                <div className="mc-history-heading">
                  <h3>Agent sessions</h3>
                  <button
                    className="mc-text-button"
                    disabled={!commandsReady}
                    onClick={() =>
                      void act(async () => {
                        const next = !showConversation;
                        await call("updateTask", {
                          id: detail.task.id,
                          expectedRevision: detail.task.revision,
                          changes: {
                            historyMode: next ? "conversation" : "overview",
                          },
                        });
                      })
                    }
                  >
                    {showConversation ? "Overview only" : "Show chat links"}
                  </button>
                </div>
                <p className="mc-help">
                  Concise outcomes from your agent sessions.
                </p>
                {detail.runs.map((run) => (
                  <RunRow
                    key={run.runId}
                    run={run}
                    showConversation={showConversation}
                    busy={!commandsReady || pending.has(`chat:${run.runId}`)}
                    open={() => void openRun(run)}
                  />
                ))}
                {!detail.runs.length && (
                  <div className="mc-no-sessions">
                    <Orbit size={23} />
                    <p>Every mission has a first flight.</p>
                    <small>
                      Start an agent to see its progress and outcome here.
                    </small>
                  </div>
                )}
                {detail.cursor && (
                  <button
                    disabled={!commandsReady}
                    onClick={() =>
                      void act(
                        async () => {
                          const page = await call<TaskDetail>("taskDetail", {
                            id: detail.task.id,
                            cursor: detail.cursor,
                          });
                          if (focused.current !== detail.task.id) return;
                          const runs = mergeBy(
                            [...detail.runs, ...page.runs],
                            (run) => run.runId,
                          );
                          loaded.current.runs = runs.length;
                          setDetail({
                            ...detail,
                            ...page,
                            runs,
                            activity: detail.activity,
                            activityCursor: detail.activityCursor,
                          });
                        },
                        undefined,
                        false,
                      )
                    }
                  >
                    Older sessions
                  </button>
                )}
              </section>
              <NotesActivity
                key={`${detail.task.id}-${noteReset}`}
                detail={detail}
                busy={!commandsReady || detail.project.archived}
                addNote={(text) =>
                  act(
                    () => call("addNote", { id: detail.task.id, text }),
                    "Note added",
                  )
                }
                older={() =>
                  void act(
                    async () => {
                      const page = await call<TaskDetail>("taskDetail", {
                        id: detail.task.id,
                        activityCursor: detail.activityCursor,
                      });
                      if (focused.current !== detail.task.id) return;
                      const activity = mergeBy(
                        [...detail.activity, ...page.activity],
                        (event) => event.id,
                      );
                      loaded.current.activity = activity.length;
                      setDetail({
                        ...detail,
                        activity,
                        activityCursor: page.activityCursor,
                      });
                    },
                    undefined,
                    false,
                  )
                }
              />
            </>
          )}
        </aside>
      )}
      {modal === "archives" && (
        <Modal title="Archived projects" close={() => setModal(null)}>
          <p className="mc-help">
            Archived projects keep their tasks and run history. Restore a
            project to bring it back to the board.
          </p>
          {data?.projects
            .filter((project) => project.archived)
            .map((project) => (
              <div className="mc-archived-project" key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <p className="mc-help">
                    {project.description || "No goal added."}
                  </p>
                </div>
                <button
                  disabled={!commandsReady}
                  onClick={() =>
                    void act(
                      () =>
                        call("updateProject", {
                          id: project.id,
                          expectedRevision: project.revision,
                          changes: { archived: false },
                        }),
                      "Project restored",
                    )
                  }
                >
                  Restore
                </button>
              </div>
            ))}
          {!data?.projects.some((project) => project.archived) && (
            <p>No archived projects.</p>
          )}
        </Modal>
      )}
      {modal === "project" && (
        <ProjectForm
          project={editProject}
          error={error}
          busy={busy}
          archive={() => {
            if (editProject)
              setConfirmation({
                title: "Archive this project?",
                description:
                  "Tasks and history stay available after restoring the project. Pause recurring schedules and finish or cancel active work first.",
                action: () =>
                  act(async () => {
                    await call("updateProject", {
                      id: editProject.id,
                      expectedRevision: editProject.revision,
                      changes: { archived: true },
                    });
                    setModal(null);
                  }, "Project archived"),
              });
          }}
          close={() => setModal(null)}
          submit={(input) =>
            void act(async () => {
              const result = await call<Project>(
                editProject ? "updateProject" : "createProject",
                editProject
                  ? {
                      id: editProject.id,
                      expectedRevision: editProject.revision,
                      changes: input,
                    }
                  : input,
              );
              await call("setView", { ...emptyView(), projectId: result.id });
              queryDraft.current.dirty = false;
              setModal(null);
            }, "Project saved")
          }
        />
      )}
      {modal === "task" && data && (
        <TaskForm
          task={editTask}
          facets={data.facets}
          error={error}
          projects={data.projects}
          projectId={project?.archived ? null : view.projectId}
          defaultStatus={defaultStatus}
          busy={busy}
          close={() => setModal(null)}
          submit={saveTask}
        />
      )}
      {modal === "filters" && (
        <Filters
          error={error}
          facets={data?.facets}
          view={view}
          busy={!commandsReady}
          close={() => setModal(null)}
          apply={(next) =>
            void act(async () => {
              queryDraft.current = { value: next.query, dirty: false };
              setQuery(next.query);
              await call("setView", next);
              setModal(null);
            })
          }
        />
      )}
      {modal === "schedule" && detail && (
        <ScheduleForm
          error={error}
          detail={detail}
          close={() => setModal(null)}
          busy={busy || pending.has(`schedule:${detail.task.id}`)}
          submit={(trigger) =>
            void act(
              async () => {
                await call("configureAutomation", {
                  id: detail.task.id,
                  expectedRevision: detail.task.revision,
                  trigger,
                });
                setModal(null);
              },
              "Automation installed",
              true,
              `schedule:${detail.task.id}`,
            )
          }
        />
      )}
      {modal === "save-view" && (
        <Modal
          title={savedView ? "Manage saved view" : "Keep this perspective"}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get("name"));
              void act(async () => {
                await call("saveView", {
                  ...(savedView ? { id: savedView.id } : {}),
                  name,
                  view:
                    savedView && !form.has("replace") ? savedView.view : view,
                });
                setModal(null);
              }, "View saved");
            }}
          >
            {error && (
              <p className="mc-error" role="alert">
                {error}
              </p>
            )}
            <label>
              View name
              <input
                name="name"
                autoFocus
                required
                maxLength={80}
                defaultValue={savedView?.name}
                placeholder="e.g. This week’s launch"
              />
            </label>
            {savedView && (
              <label className="mc-check">
                <input type="checkbox" name="replace" />
                Replace its filters with the current view
              </label>
            )}
            <div className="mc-form-footer">
              {savedView && (
                <button
                  type="button"
                  disabled={!commandsReady}
                  onClick={() =>
                    setConfirmation({
                      title: "Remove this saved view?",
                      description:
                        "Only this saved filter is removed. Projects, cards and history stay available.",
                      action: () =>
                        act(async () => {
                          await call("removeView", { id: savedView.id });
                          setModal(null);
                        }, "Saved view removed"),
                    })
                  }
                >
                  Remove view
                </button>
              )}
              <ModalCloseButton>Cancel</ModalCloseButton>
              <button className="mc-primary" disabled={!commandsReady}>
                Save view
                <Bookmark size={14} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "commands" && (
        <CommandPalette commands={commands} close={() => setModal(null)} />
      )}
      {modal === "shortcuts" && (
        <Modal title="Stay in your flow" close={() => setModal(null)}>
          <dl className="mc-shortcuts">
            {[
              ["Ctrl / ⌘ K", "Open command menu"],
              ["/", "Focus task search"],
              ["N", "Create a task"],
              ["P", "Create a project"],
              ["?", "Show these shortcuts"],
              ["Esc", "Close a dialog or task inspector"],
              ["Ctrl / ⌘ Enter", "Submit an open form"],
            ].map(([key, description]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <p className="mc-help">
            Single-key shortcuts stay out of your way while typing. Select cards
            to reveal bulk actions. Drag cards to move them, or use the
            accessible Move task control.
          </p>
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} close={() => setConfirmation(null)}>
          <p className="mc-confirm-copy">{confirmation.description}</p>
          <div className="mc-form-footer">
            <button onClick={() => setConfirmation(null)}>Keep working</button>
            <button
              className="mc-primary"
              disabled={busy}
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(null);
                void action();
              }}
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
