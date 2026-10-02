import {
  DurableObjectBase,
  rpc,
  createDurableObjectServiceClient,
} from "@workspace/runtime/worker/kernel";
import { z } from "zod";
import {
  projectInput,
  taskInput,
  viewInput,
  emptyView,
  executionPrompt,
  STATUSES,
  STATUS_LABELS,
  type Task,
  type Project,
  type View,
  type SavedView,
  type Overview,
  type Automation,
  type Session,
  type TaskDetail,
  type MissionTrigger,
  type TaskEvent,
  type DependencySummary,
  dueDayBounds,
} from "@workspace/mission-control";
import { launchAgentIntoChannel } from "@workspace/agentic-core/agent-launch";
import { LEAD_INSTRUCTIONS } from "@workspace/mission-control";
import { triggerSchema } from "@vibestudio/workspace-contracts/automations";

const keyInput = z
  .object({
    id: z.string().min(1),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
type RecordRow = { id: string; data: string };
const SOURCE = "workers/mission-agent";
const CLASS = "MissionAgent";
const taskFieldLabels: Record<keyof z.output<typeof taskInput>, string> = {
  projectId: "Project",
  title: "Title",
  description: "Brief",
  status: "Status",
  priority: "Priority",
  category: "Category",
  tags: "Tags",
  dependencies: "Dependencies",
  checklist: "Acceptance checklist",
  dueAt: "Due date",
  historyMode: "Session presentation",
};
function recordFields(task: Task) {
  const {
    id: _id,
    revision: _revision,
    automationId: _automationId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...fields
  } = task;
  return fields;
}

/** Shared domain state. Conversations and run outcomes belong to MissionsDO. */
export class MissionControlStore extends DurableObjectBase {
  static override schemaVersion = 2;
  private readonly executionCommands = new Map<string, Promise<void>>();
  private readonly archivingProjects = new Set<string>();
  private leadLaunch: Promise<{ channelId: string; contextId: string }> | null =
    null;

  // Only execution commands queue here. Ordinary card reads/edits remain
  // callable while an executor is being cancelled and joined.
  private async executionCommand<T>(
    id: string,
    command: () => Promise<T>,
  ): Promise<T> {
    const previous = this.executionCommands.get(id) ?? Promise.resolve();
    let release!: () => void;
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.executionCommands.set(id, completion);
    await previous;
    try {
      return await command();
    } finally {
      release();
      if (this.executionCommands.get(id) === completion)
        this.executionCommands.delete(id);
    }
  }
  protected createTables(): void {
    this.sql
      .exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE INDEX tasks_project ON tasks(project_id);
      CREATE TABLE views (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
    this.createActivityTable();
  }
  private createActivityTable(): void {
    this.sql
      .exec(`CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL);
      CREATE INDEX task_events_task ON task_events(task_id,id DESC);`);
  }
  protected override requiredTables(): readonly string[] {
    return ["projects", "tasks", "views", "task_events"];
  }
  protected override schemaUpgrades() {
    return [
      {
        fromVersion: 1,
        fromFingerprint:
          '[{"type":"index","name":"tasks_project","table":"tasks","sql":"CREATE INDEX tasks_project ON tasks(project_id)"},{"type":"table","name":"projects","table":"projects","sql":"CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)"},{"type":"table","name":"state","table":"state","sql":"CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL)"},{"type":"table","name":"tasks","table":"tasks","sql":"CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL)"},{"type":"table","name":"views","table":"views","sql":"CREATE TABLE views (id TEXT PRIMARY KEY, data TEXT NOT NULL)"}]',
        upgrade: () => {
          this.createActivityTable();
          this.sql.exec(
            "UPDATE tasks SET data=json_set(data,'$.checklist',json('[]')) WHERE json_type(data,'$.checklist') IS NULL",
          );
          const currentView = this.getStateValue("view");
          if (currentView)
            this.setStateValue(
              "view",
              JSON.stringify(viewInput.parse(JSON.parse(currentView))),
            );
          this.clearArchivedSelection();
          for (const row of this.sql
            .exec<RecordRow>("SELECT id,data FROM views")
            .toArray()) {
            const saved = JSON.parse(row.data) as SavedView;
            this.sql.exec(
              "UPDATE views SET data=? WHERE id=?",
              JSON.stringify({ ...saved, view: viewInput.parse(saved.view) }),
              row.id,
            );
          }
        },
      },
    ];
  }
  private clearArchivedSelection(projectId?: string): void {
    const retained = this.getStateValue("view");
    if (!retained) return;
    const view = viewInput.parse(JSON.parse(retained));
    if (view.projectId && (projectId ? view.projectId === projectId : this.project(view.projectId).archived)) {
      this.setStateValue("view", JSON.stringify({ ...view, projectId: null }));
    }
  }
  private readTask(data: string): Task {
    const record = JSON.parse(data) as Task;
    return { ...record, ...taskInput.parse(recordFields(record)) };
  }
  private project(id: string): Project {
    const row = this.sql
      .exec<RecordRow>("SELECT id, data FROM projects WHERE id = ?", id)
      .toArray()[0];
    if (!row) throw new Error("Project no longer exists");
    return JSON.parse(row.data) as Project;
  }
  private task(id: string): Task {
    const row = this.sql
      .exec<RecordRow>("SELECT id, data FROM tasks WHERE id = ?", id)
      .toArray()[0];
    if (!row) throw new Error("Task no longer exists");
    return this.readTask(row.data);
  }
  private dependencyTasks(ids: string[]): Task[] {
    if (!ids.length) return [];
    const records = new Map(
      this.sql
        .exec<RecordRow>(
          "SELECT id,data FROM tasks WHERE id IN (SELECT value FROM json_each(?))",
          JSON.stringify(ids),
        )
        .toArray()
        .map((row) => [row.id, this.readTask(row.data)]),
    );
    return ids.map((id) => {
      const task = records.get(id);
      if (!task) throw new Error("Task dependency no longer exists");
      return task;
    });
  }
  private checkRevision(record: { revision: number }, expected: number): void {
    if (record.revision !== expected)
      throw new Error("This card changed. Refresh before saving your edit.");
  }
  private appendEvent(
    taskId: string,
    event: Omit<TaskEvent, "id" | "taskId" | "createdAt">,
  ): TaskEvent {
    const createdAt = Date.now();
    const row = this.sql
      .exec<{
        id: number;
      }>("INSERT INTO task_events(task_id,data) VALUES (?,?) RETURNING id", taskId, JSON.stringify({ ...event, createdAt }))
      .one();
    return { ...event, id: String(row.id), taskId, createdAt };
  }
  private writeTask(
    task: Task,
    event?: Omit<TaskEvent, "id" | "taskId" | "createdAt">,
  ): Task {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql
        .exec<RecordRow>("SELECT id,data FROM tasks WHERE id=?", task.id)
        .toArray()[0];
      const previous = row ? this.readTask(row.data) : null;
      this.sql.exec(
        "INSERT INTO tasks (id, project_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, data = excluded.data",
        task.id,
        task.projectId,
        JSON.stringify(task),
      );
      const changedFields = previous
        ? Object.keys(task).filter(
            (field) =>
              !["revision", "updatedAt"].includes(field) &&
              JSON.stringify(task[field as keyof Task]) !==
                JSON.stringify(previous[field as keyof Task]),
          )
        : [];
      if (event) this.appendEvent(task.id, event);
      else if (!previous)
        this.appendEvent(task.id, { kind: "created", summary: "Task created" });
      else if (changedFields.length) {
        const kind = changedFields.includes("automationId")
          ? "automation-linked"
          : changedFields.includes("status") && task.status === "cancelled"
            ? "cancelled"
            : "updated";
        const summary = changedFields
          .map((field) =>
            field === "status"
              ? `Status: ${STATUS_LABELS[previous.status]} → ${STATUS_LABELS[task.status]}`
              : field === "projectId"
                ? `Moved to ${this.project(task.projectId).name}`
                : field === "automationId"
                  ? "Agent execution connected"
                  : `${taskFieldLabels[field as keyof typeof taskFieldLabels]} updated`,
          )
          .join(" · ");
        this.appendEvent(task.id, { kind, summary, changedFields });
      }
      return task;
    });
  }
  private activity(
    id: string,
    cursor?: string,
  ): { activity: TaskEvent[]; activityCursor: string | null } {
    const rows = this.sql
      .exec<{
        id: number;
        data: string;
      }>("SELECT id,data FROM task_events WHERE task_id=? AND id<? ORDER BY id DESC LIMIT 21", id, cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER)
      .toArray();
    const page = rows.slice(0, 20);
    return {
      activity: page.map(
        (row) =>
          ({
            ...JSON.parse(row.data),
            id: String(row.id),
            taskId: id,
          }) as TaskEvent,
      ),
      activityCursor: rows.length > 20 ? String(page.at(-1)!.id) : null,
    };
  }
  private missions() {
    return createDurableObjectServiceClient(this.rpc, "vibestudio.missions.v1");
  }
  private async agent(key: string): Promise<string> {
    const entity = await this.rpc.call<{ targetId: string }>(
      "main",
      "runtime.createEntity",
      [
        {
          kind: "do",
          execution: { surface: "code", source: SOURCE },
          className: CLASS,
          key,
        },
      ],
    );
    return entity.targetId;
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  overview(input: { cursor?: string; limit?: number } = {}): Overview {
    const options = z
      .object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .strict()
      .parse(input);
    const projects = this.sql
      .exec<RecordRow>("SELECT id, data FROM projects ORDER BY id")
      .toArray()
      .map((row) => JSON.parse(row.data) as Project);
    const views = this.sql
      .exec<RecordRow>("SELECT id, data FROM views ORDER BY id")
      .toArray()
      .map((row) => {
        const saved = JSON.parse(row.data) as SavedView;
        return { ...saved, view: viewInput.parse(saved.view) };
      });
    const view = viewInput.parse(
      JSON.parse(this.getStateValue("view") ?? JSON.stringify(emptyView())),
    );
    const clauses = ["json_extract(p.data,'$.archived')=0"];
    const args: (string | number)[] = [];
    if (view.projectId) {
      clauses.push("t.project_id=?");
      args.push(view.projectId);
    }
    const facets = {
      categories: this.sql
        .exec<{ value: string }>(
          `SELECT DISTINCT json_extract(t.data,'$.category') AS value FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${clauses.join(" AND ")} AND value<>'' ORDER BY value COLLATE NOCASE,value`,
          ...args,
        )
        .toArray()
        .map((row) => row.value),
      tags: this.sql
        .exec<{ value: string }>(
          `SELECT DISTINCT j.value FROM tasks t JOIN projects p ON p.id=t.project_id JOIN json_each(t.data,'$.tags') j WHERE ${clauses.join(" AND ")} ORDER BY j.value COLLATE NOCASE,j.value`,
          ...args,
        )
        .toArray()
        .map((row) => row.value),
    };
    const countsRows = this.sql
      .exec<{
        status: string;
        count: number;
      }>(`SELECT json_extract(t.data,'$.status') AS status,COUNT(*) AS count FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${clauses.join(" AND ")} GROUP BY status`, ...args)
      .toArray();
    const counts = Object.fromEntries(
      STATUSES.map((status) => [
        status,
        countsRows.find((row) => row.status === status)?.count ?? 0,
      ]),
    ) as Overview["counts"];
    if (view.statuses.length) {
      clauses.push(
        `json_extract(t.data,'$.status') IN (${view.statuses.map(() => "?").join(",")})`,
      );
      args.push(...view.statuses);
    }
    if (view.priorities.length) {
      clauses.push(
        `json_extract(t.data,'$.priority') IN (${view.priorities.map(() => "?").join(",")})`,
      );
      args.push(...view.priorities);
    }
    if (view.tag) {
      clauses.push(
        "EXISTS (SELECT 1 FROM json_each(t.data,'$.tags') WHERE value=?)",
      );
      args.push(view.tag);
    }
    if (view.category) {
      clauses.push("json_extract(t.data,'$.category')=?");
      args.push(view.category);
    }
    if (view.query) {
      clauses.push(
        "instr(lower(json_extract(t.data,'$.title') || ' ' || json_extract(t.data,'$.description') || ' ' || json_extract(t.data,'$.category') || ' ' || json_extract(t.data,'$.tags')),lower(?))>0",
      );
      args.push(view.query);
    }
    if (view.execution !== "any")
      clauses.push(
        `json_extract(t.data,'$.automationId') IS ${view.execution === "linked" ? "NOT " : ""}NULL`,
      );
    if (view.blocked)
      clauses.push(
        "EXISTS (SELECT 1 FROM json_each(t.data,'$.dependencies') d LEFT JOIN tasks dependency ON dependency.id=d.value WHERE dependency.id IS NULL OR json_extract(dependency.data,'$.status')<>'done')",
      );
    if (view.due === "none")
      clauses.push("json_extract(t.data,'$.dueAt') IS NULL");
    else if (view.due !== "any") {
      const bounds = dueDayBounds(Date.now(), view.timezone);
      if (view.due === "overdue") {
        clauses.push(
          "json_extract(t.data,'$.dueAt')<? AND json_extract(t.data,'$.status') NOT IN ('done','cancelled')",
        );
        args.push(bounds.today);
      } else {
        clauses.push(
          "json_extract(t.data,'$.dueAt')>=? AND json_extract(t.data,'$.dueAt')<?",
        );
        args.push(
          bounds.today,
          view.due === "today" ? bounds.tomorrow : bounds.week,
        );
      }
    }
    const filter = clauses.join(" AND ");
    const total = Number(
      this.sql
        .exec<{
          total: number;
        }>(`SELECT COUNT(*) AS total FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${filter}`, ...args)
        .one().total,
    );
    const primary =
      view.sort === "due"
        ? "coalesce(json_extract(t.data,'$.dueAt'),9007199254740991)"
        : view.sort === "updated"
          ? "-json_extract(t.data,'$.updatedAt')"
          : "CASE json_extract(t.data,'$.priority') WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";
    let after = "";
    if (options.cursor) {
      const cursor = z
        .object({
          view: z.string(),
          primary: z.number(),
          updated: z.number(),
          id: z.string(),
        })
        .strict()
        .parse(JSON.parse(options.cursor));
      if (cursor.view !== JSON.stringify(view))
        throw new Error(
          "The view changed. Refresh before loading another page.",
        );
      after = ` AND (${primary}>? OR (${primary}=? AND (json_extract(t.data,'$.updatedAt')<? OR (json_extract(t.data,'$.updatedAt')=? AND t.id>?))))`;
      args.push(
        cursor.primary,
        cursor.primary,
        cursor.updated,
        cursor.updated,
        cursor.id,
      );
    }
    const rows = this.sql
      .exec<
        RecordRow & { sort_primary: number }
      >(`SELECT t.id,t.data,${primary} AS sort_primary FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${filter}${after} ORDER BY sort_primary,json_extract(t.data,'$.updatedAt') DESC,t.id LIMIT ?`, ...args, options.limit + 1)
      .toArray();
    const page = rows.slice(0, options.limit);
    const tasks = page.map((row) => this.readTask(row.data));
    const last = page.at(-1);
    const dependencySummaries: Record<string, DependencySummary> = {};
    const dependencyTasks = new Map(
      this.dependencyTasks([
        ...new Set(tasks.flatMap((task) => task.dependencies)),
      ]).map((task) => [task.id, task]),
    );
    for (const task of tasks) {
      const dependencies = task.dependencies.map(
        (id) => dependencyTasks.get(id)!,
      );
      dependencySummaries[task.id] = {
        total: dependencies.length,
        done: dependencies.filter((dependency) => dependency.status === "done")
          .length,
        blockedIds: dependencies
          .filter((dependency) => dependency.status !== "done")
          .map((dependency) => dependency.id),
      };
    }
    return {
      projects,
      tasks,
      view,
      views,
      facets,
      dependencySummaries,
      total,
      counts,
      cursor:
        rows.length > options.limit && last
          ? JSON.stringify({
              view: JSON.stringify(view),
              primary: last.sort_primary,
              updated: tasks.at(-1)!.updatedAt,
              id: last.id,
            })
          : null,
    };
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getTask(input: { id: string }): Task {
    return this.task(
      z
        .object({ id: z.string().min(1) })
        .strict()
        .parse(input).id,
    );
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  taskOptions(
    input: {
      projectId?: string;
      query?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): { tasks: Task[]; cursor: string | null } {
    const options = z
      .object({
        projectId: z.string().min(1).optional(),
        query: z.string().max(200).default(""),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .strict()
      .parse(input);
    const clauses: string[] = ["id>?"];
    const args: (string | number)[] = [options.cursor ?? ""];
    if (options.projectId) {
      this.project(options.projectId);
      clauses.push("project_id=?");
      args.push(options.projectId);
    }
    if (options.query) {
      clauses.push(
        "instr(lower(json_extract(data,'$.title') || ' ' || json_extract(data,'$.category') || ' ' || json_extract(data,'$.tags')),lower(?))>0",
      );
      args.push(options.query);
    }
    const rows = this.sql
      .exec<RecordRow>(
        `SELECT id,data FROM tasks WHERE ${clauses.join(" AND ")} ORDER BY id LIMIT ?`,
        ...args,
        options.limit + 1,
      )
      .toArray();
    const page = rows.slice(0, options.limit);
    return {
      tasks: page.map((row) => this.readTask(row.data)),
      cursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  createProject(input: unknown): Project {
    const project: Project = {
      ...projectInput.parse(input),
      id: crypto.randomUUID(),
      revision: 1,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sql.exec(
      "INSERT INTO projects (id, data) VALUES (?, ?)",
      project.id,
      JSON.stringify(project),
    );
    return project;
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async updateProject(input: unknown): Promise<Project> {
    const { id, expectedRevision, changes } = z
      .object({
        ...keyInput.shape,
        changes: projectInput
          .partial()
          .extend({ archived: z.boolean().optional() })
          .strict(),
      })
      .strict()
      .parse(input);
    const project = this.project(id);
    this.checkRevision(project, expectedRevision);
    if (this.archivingProjects.has(id))
      throw new Error(
        "This project's archive operation is already in progress.",
      );
    if (changes.archived) this.archivingProjects.add(id);
    try {
      if (changes.archived) {
        const tasks = this.sql
          .exec<RecordRow>("SELECT id,data FROM tasks WHERE project_id=?", id)
          .toArray()
          .map((row) => this.readTask(row.data));
        if (tasks.some((task) => task.status === "active"))
          throw new Error(
            "Cancel or move active tasks before archiving their project.",
          );
        if (tasks.some((task) => this.executionCommands.has(task.id)))
          throw new Error(
            "Finish this project's execution operation before archiving it.",
          );
        for (const task of tasks) {
          if (!task.automationId) continue;
          const missions = this.missions();
          const summary = await missions.call<{
            items: { automation: Automation; activeRuns: number }[];
          }>("overview", { missionId: task.automationId, limit: 1 });
          const item = summary.items[0];
          if (item?.activeRuns)
            throw new Error(
              "Cancel live execution before archiving this project.",
            );
          if (
            item?.automation.state === "active" &&
            item.automation.charter.trigger.kind !== "manual"
          )
            throw new Error(
              "Pause recurring automations before archiving this project.",
            );
        }
      }
      const current = this.project(id);
      this.checkRevision(current, expectedRevision);
      const next = {
        ...current,
        ...changes,
        revision: current.revision + 1,
        updatedAt: Date.now(),
      };
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          "UPDATE projects SET data=? WHERE id=?",
          JSON.stringify(next),
          id,
        );
        if (next.archived) this.clearArchivedSelection(id);
      });
      return next;
    } finally {
      this.archivingProjects.delete(id);
    }
  }

  private validateTask(task: Task): void {
    if (this.archivingProjects.has(task.projectId))
      throw new Error(
        "Finish this project's archive operation before changing its tasks.",
      );
    if (this.project(task.projectId).archived)
      throw new Error(
        "Restore this project before adding or moving tasks to it.",
      );
    const visiting = new Set<string>([task.id]);
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id))
        throw new Error("Task dependencies cannot form a cycle.");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const child of this.task(id).dependencies) visit(child);
      visiting.delete(id);
      visited.add(id);
    };
    for (const dependency of task.dependencies) visit(dependency);
    if (
      task.status === "active" &&
      task.dependencies.some((id) => this.task(id).status !== "done")
    )
      throw new Error("Complete this task's dependencies before execution.");
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  createTask(input: unknown): Task {
    const task: Task = {
      ...taskInput.parse(input),
      id: crypto.randomUUID(),
      revision: 1,
      automationId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.validateTask(task);
    return this.writeTask(task);
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  updateTask(input: unknown): Task {
    const { id, expectedRevision, changes } = z
      .object({ ...keyInput.shape, changes: taskInput.partial().strict() })
      .strict()
      .parse(input);
    const task = this.task(id);
    this.checkRevision(task, expectedRevision);
    if (
      changes.status === "cancelled" &&
      task.status !== "cancelled" &&
      (task.status === "active" || task.automationId)
    )
      throw new Error(
        "Use cancelTask to stop execution before cancelling this card.",
      );
    const next = {
      ...task,
      ...changes,
      revision: task.revision + 1,
      updatedAt: Date.now(),
    };
    this.validateTask(next);
    return this.writeTask(next);
  }

  @rpc({
    website: { kind: "closed", reason: "Private task notes." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  addNote(input: unknown): TaskEvent {
    const { id, text } = z
      .object({
        id: z.string().min(1),
        text: z.string().trim().min(1).max(8000),
      })
      .strict()
      .parse(input);
    this.task(id);
    return this.appendEvent(id, { kind: "note", summary: "Note added", text });
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  duplicateTask(input: unknown): Task {
    const { id, expectedRevision } = keyInput.parse(input);
    const source = this.task(id);
    this.checkRevision(source, expectedRevision);
    const copy: Task = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title.slice(0, 193)} (copy)`,
      status: "inbox",
      revision: 1,
      automationId: null,
      checklist: source.checklist.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        done: false,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.validateTask(copy);
    return this.writeTask(copy, {
      kind: "duplicated",
      summary: `Duplicated from ${source.title}`,
      sourceTaskId: source.id,
    });
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setView(input: unknown): View {
    const view = viewInput.parse(input);
    if (view.projectId && this.project(view.projectId).archived)
      throw new Error("Restore this project before selecting it in a view.");
    this.setStateValue("view", JSON.stringify(view));
    return view;
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  saveView(input: unknown): SavedView {
    const { id, ...data } = z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().trim().min(1).max(80),
        view: viewInput,
      })
      .strict()
      .parse(input);
    if (data.view.projectId) this.project(data.view.projectId);
    if (
      id &&
      !this.sql
        .exec<RecordRow>("SELECT id,data FROM views WHERE id=?", id)
        .toArray().length
    )
      throw new Error("Saved view no longer exists");
    const view = { id: id ?? crypto.randomUUID(), ...data };
    this.sql.exec(
      "INSERT INTO views(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      view.id,
      JSON.stringify(view),
    );
    return view;
  }

  @rpc({
    website: { kind: "closed", reason: "Private workspace planning data." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  removeView(input: { id: string }): void {
    this.sql.exec(
      "DELETE FROM views WHERE id = ?",
      z
        .object({ id: z.string().min(1) })
        .strict()
        .parse(input).id,
    );
  }

  @rpc({
    website: { kind: "closed", reason: "Private execution history." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async taskDetail(input: {
    id: string;
    cursor?: { startedAt: number; runId: string };
    activityCursor?: string;
  }): Promise<TaskDetail> {
    const parsed = z
      .object({
        id: z.string().min(1),
        cursor: z
          .object({ startedAt: z.number(), runId: z.string() })
          .optional(),
        activityCursor: z
          .string()
          .regex(/^[1-9]\d*$/)
          .refine(
            (value) => Number.isSafeInteger(Number(value)),
            "Invalid activity cursor",
          )
          .optional(),
      })
      .strict()
      .parse(input);
    const task = this.task(parsed.id);
    const project = this.project(task.projectId);
    const activity = this.activity(task.id, parsed.activityCursor);
    const dependencies = this.dependencyTasks(task.dependencies);
    if (!task.automationId)
      return {
        task,
        project,
        dependencies,
        ...activity,
        automation: null,
        runs: [],
        cursor: null,
      };
    const missions = this.missions();
    const [automation, page] = await Promise.all([
      missions.call<Automation | null>("get", task.automationId),
      missions.call<{ items: Session[]; nextCursor?: TaskDetail["cursor"] }>(
        "listRuns",
        task.automationId,
        { limit: 20, ...(parsed.cursor ? { cursor: parsed.cursor } : {}) },
      ),
    ]);
    return {
      task,
      project,
      dependencies,
      ...activity,
      automation,
      runs: page.items,
      cursor: page.nextCursor ?? null,
    };
  }

  private async configure(
    id: string,
    expectedRevision: number,
    trigger: MissionTrigger,
  ): Promise<Automation> {
    const task = this.task(id);
    this.checkRevision(task, expectedRevision);
    this.validateTask(task);
    if (task.status === "cancelled" || task.status === "done")
      throw new Error("Move this task to Ready before starting new work.");
    const target = await this.agent(`mission-task-${id}`);
    const automation = await this.rpc.call<Automation>(
      target,
      "installTaskAutomation",
      [
        {
          taskId: task.id,
          name: task.title,
          prompt: executionPrompt(task),
          trigger,
          automationId: task.automationId,
        },
      ],
    );
    // Re-read after remote effects. Preserve concurrent edits and retain the actual linkage.
    const current = this.task(id);
    if (current.automationId && current.automationId !== automation.missionId)
      throw new Error("Task already has a different automation.");
    this.writeTask({
      ...current,
      automationId: automation.missionId,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
    // Installation owns the resulting automation even when a concurrent card
    // edit accepts cancellation before the automation identity is available.
    if (current.status === "cancelled")
      return this.missions().call<Automation>("cancel", automation.missionId);
    return automation;
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Only workspace callers may launch task work.",
    },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async configureAutomation(input: unknown): Promise<Automation> {
    const { id, expectedRevision, trigger } = z
      .object({ ...keyInput.shape, trigger: triggerSchema })
      .strict()
      .parse(input);
    return this.executionCommand(id, () =>
      this.configure(id, expectedRevision, trigger),
    );
  }

  @rpc({
    website: {
      kind: "closed",
      reason: "Only workspace callers may launch task work.",
    },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async startTask(input: unknown): Promise<Session> {
    const { id, expectedRevision } = keyInput.parse(input);
    return this.executionCommand(id, async () => {
      const task = this.task(id);
      this.checkRevision(task, expectedRevision);
      const missions = this.missions();
      const current = task.automationId
        ? await missions.call<Automation | null>("get", task.automationId)
        : null;
      const automation =
        current ??
        (await this.configure(id, expectedRevision, { kind: "manual" }));
      const latest = this.task(id);
      this.validateTask({ ...latest, status: "active" });
      if (
        latest.status === "cancelled" ||
        (latest.status === "done" &&
          automation.charter.trigger.kind === "manual")
      )
        throw new Error("Move this task to Ready before starting new work.");
      if (automation.state === "paused")
        await missions.call("resume", automation.missionId);
      return missions.call<Session>("runNow", automation.missionId);
    });
  }

  @rpc({
    website: { kind: "closed", reason: "Private execution controls." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async controlTask(input: unknown): Promise<Automation> {
    const { id, action } = z
      .object({ id: z.string().min(1), action: z.enum(["pause", "resume"]) })
      .strict()
      .parse(input);
    return this.executionCommand(id, async () => {
      const task = this.task(id);
      if (!task.automationId) throw new Error("This task has no automation.");
      if (action === "resume") {
        const automation = await this.missions().call<Automation | null>(
          "get",
          task.automationId,
        );
        if (
          task.status === "cancelled" ||
          (task.status === "done" &&
            automation?.charter.trigger.kind === "manual") ||
          this.project(task.projectId).archived
        )
          throw new Error(
            "Restore this task to Ready in an unarchived project before resuming.",
          );
        this.validateTask({ ...task, status: "active" });
      }
      return this.missions().call<Automation>(action, task.automationId);
    });
  }

  @rpc({
    website: { kind: "closed", reason: "Private execution controls." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancelTask(input: unknown): Promise<Task> {
    const { id, expectedRevision } = keyInput.parse(input);
    return this.executionCommand(id, async () => {
      const task = this.task(id);
      this.checkRevision(task, expectedRevision);
      if (task.automationId)
        await this.missions().call("cancel", task.automationId);
      const latest = this.task(id);
      if (latest.status !== task.status)
        throw new Error(
          "Execution stopped, but this card's state changed. Refresh before cancelling the card.",
        );
      return this.writeTask({
        ...latest,
        status: "cancelled",
        revision: latest.revision + 1,
        updatedAt: Date.now(),
      });
    });
  }

  @rpc({
    website: { kind: "closed", reason: "Private mission lead conversation." },
    principals: ["user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async lead(): Promise<{ channelId: string; contextId: string }> {
    const retainedValue = this.getStateValue("lead");
    const retained = retainedValue
      ? (JSON.parse(retainedValue) as { channelId: string; contextId: string })
      : null;
    if (this.leadLaunch) return this.leadLaunch;
    const launch = (async () => {
      const channelId = "mission-control-lead";
      await this.rpc.call("main", "runtime.createEntity", [
        {
          kind: "do",
          execution: { surface: "code", source: "workers/pubsub-channel" },
          className: "PubSubChannel",
          key: channelId,
        },
      ]);
      const launched = await launchAgentIntoChannel(this.rpc, {
        source: SOURCE,
        className: CLASS,
        key: "mission-control-lead",
        channelId,
        ...(retained ? { contextId: retained.contextId } : {}),
        config: {
          name: "Mission lead",
          handle: "mission-lead",
          systemPrompt: LEAD_INSTRUCTIONS,
          systemPromptMode: "append",
        },
        replay: false,
      });
      const result = { channelId, contextId: launched.contextId };
      this.setStateValue("lead", JSON.stringify(result));
      return result;
    })();
    this.leadLaunch = launch;
    try {
      return await launch;
    } finally {
      if (this.leadLaunch === launch) this.leadLaunch = null;
    }
  }
}
