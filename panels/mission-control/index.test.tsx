// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyView,
  type Overview,
  type Project,
  type Session,
  type Task,
  type TaskDetail,
} from "@workspace/mission-control";
import MissionControl from "./index.js";

const runtime = vi.hoisted(() => ({
  call: vi.fn(),
  openPanel: vi.fn(),
  sourceTree: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  createDurableObjectServiceClient: () => ({ call: runtime.call }),
  openPanel: runtime.openPanel,
  workspace: { sourceTree: runtime.sourceTree },
}));
vi.mock("@workspace/ui/icons", () =>
  Object.fromEntries(
    [
      "Orbit",
      "Plus",
      "Search",
      "Columns3",
      "List",
      "ArrowUpRight",
      "Play",
      "Square",
      "X",
      "GitBranch",
      "Sparkles",
      "Clock3",
      "SlidersHorizontal",
      "Bookmark",
      "ChevronRight",
      "Check",
      "RefreshCw",
      "ArrowLeft",
      "Tag",
      "CalendarClock",
      "Folder",
      "Inbox",
      "CircleCheck",
      "CircleDot",
      "MoreHorizontal",
    ].map((name) => [name, () => null]),
  ),
);

const project: Project = {
  id: "project",
  revision: 1,
  name: "Launch",
  description: "Ship something useful",
  repos: [],
  color: "violet",
  archived: false,
  createdAt: 1,
  updatedAt: 1,
};
const task = (id: string, title: string): Task => ({
  id,
  title,
  revision: 1,
  projectId: project.id,
  description: "",
  status: "inbox",
  priority: "normal",
  category: "",
  tags: [],
  dependencies: [],
  checklist: [],
  dueAt: null,
  historyMode: "overview",
  automationId: null,
  createdAt: 1,
  updatedAt: 1,
});
const first = task("one", "First mission");
const second = task("two", "Second mission");
const overview = (tasks = [first], cursor: string | null = null): Overview => ({
  facets: { categories: [], tags: [] },
  dependencySummaries: {},
  projects: [project],
  tasks,
  view: emptyView(),
  views: [],
  cursor,
  total: 2,
  counts: { inbox: 2, ready: 0, active: 0, review: 0, done: 0, cancelled: 0 },
});
const detail = (
  item: Task,
  runs: Session[] = [],
  cursor: TaskDetail["cursor"] = null,
): TaskDetail => ({
  activity: [],
  activityCursor: null,
  dependencies: [],
  task: item,
  project,
  automation: null,
  runs,
  cursor,
});

beforeEach(() => {
  runtime.call.mockReset();
  runtime.openPanel.mockReset();
  runtime.sourceTree.mockReset();
  runtime.sourceTree.mockResolvedValue({ children: [] });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
  runtime.call.mockImplementation(
    async (method: string, input?: { id?: string; cursor?: unknown }) => {
      if (method === "overview") return overview();
      if (method === "taskDetail")
        return detail(input?.id === "two" ? second : first);
      if (method === "taskOptions")
        return { tasks: [first, second], cursor: null };
      if (method === "getTask") return input?.id === "two" ? second : first;
      return undefined;
    },
  );
});
afterEach(() => cleanup());

const open = async () => {
  render(<MissionControl />);
  await screen.findByRole("button", { name: "First mission" });
};
const refresh = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh mission control" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Refresh mission control",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
};

describe("Mission Control interaction ownership", () => {
  it("preserves an unsubmitted search draft when shared state refreshes", async () => {
    await open();
    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), {
      target: { value: "unfinished thought" },
    });
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await waitFor(() =>
      expect(
        runtime.call.mock.calls.filter(([method]) => method === "overview"),
      ).toHaveLength(2),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Search tasks",
        }) as HTMLInputElement
      ).value,
    ).toBe("unfinished thought");
  });

  it("keeps paginated tasks loaded after an explicit refresh", async () => {
    runtime.call.mockImplementation(
      async (method: string, input?: { id?: string; cursor?: unknown }) =>
        method === "overview"
          ? input?.cursor
            ? overview([second])
            : overview([first], "one")
          : undefined,
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Load more tasks" }));
    await screen.findByRole("button", { name: "Second mission" });
    await refresh();
    expect(screen.getByRole("button", { name: "Second mission" })).toBeTruthy();
    expect(
      runtime.call.mock.calls.filter(
        ([method, input]) => method === "overview" && input?.cursor === "one",
      ),
    ).toHaveLength(2);
  });

  it("keeps older sessions visible after refreshing the task", async () => {
    const recent: Session = {
      runId: "recent",
      missionId: "mission",
      phase: "terminal",
      startedAt: 20,
      completionResponse: "Latest result",
    };
    const older: Session = {
      runId: "older",
      missionId: "mission",
      phase: "terminal",
      startedAt: 10,
      completionResponse: "Earlier result",
    };
    runtime.call.mockImplementation(
      async (method: string, input?: { id?: string; cursor?: unknown }) =>
        method === "overview"
          ? overview()
          : method === "taskDetail"
            ? input?.cursor
              ? detail(first, [older])
              : detail(first, [recent], { startedAt: 20, runId: "recent" })
            : undefined,
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    await screen.findByText("Latest result");
    fireEvent.click(screen.getByRole("button", { name: "Older sessions" }));
    await screen.findByText("Earlier result");
    await refresh();
    expect(screen.getByText("Earlier result")).toBeTruthy();
  });

  it("never replaces a newly focused task with a previous task's delayed response", async () => {
    let resolveFirst!: (value: TaskDetail) => void;
    runtime.call.mockImplementation(
      async (method: string, input?: { id?: string; cursor?: unknown }) => {
        if (method === "overview") return overview([first, second]);
        if (method === "taskDetail")
          return input?.id === "one"
            ? new Promise<TaskDetail>((resolve) => {
                resolveFirst = resolve;
              })
            : detail(second);
        return undefined;
      },
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Second mission" }));
    await screen.findByRole("heading", { name: "Second mission" });
    await act(async () => resolveFirst(detail(first)));
    expect(
      screen.getByRole("heading", { name: "Second mission" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "First mission" })).toBeNull();
  });

  it("creates a task in the column chosen by its add button", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add task to Ready" }));
    const dialog = screen.getByRole("dialog");
    expect(
      (
        within(dialog).getByRole("combobox", {
          name: "Status",
        }) as HTMLSelectElement
      ).value,
    ).toBe("ready");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Task title" }),
      { target: { value: "Ready mission" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create task" }),
    );
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        "createTask",
        expect.objectContaining({ title: "Ready mission", status: "ready" }),
      ),
    );
  });

  it("preserves a dependency omitted by the current board filters", async () => {
    const dependent = { ...first, dependencies: [second.id] };
    runtime.call.mockImplementation(async (method: string) => {
      if (method === "overview") return overview([dependent]);
      if (method === "taskDetail") return detail(dependent);
      if (method === "taskOptions") return { tasks: [dependent], cursor: null };
      if (method === "getTask") return second;
      return undefined;
    });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit First mission" }),
    );
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("button", {
      name: "Remove dependency Second mission",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        "updateTask",
        expect.objectContaining({
          changes: expect.objectContaining({ dependencies: [second.id] }),
        }),
      ),
    );
  });

  it("persists the overview preference and opens the run's actual conversation", async () => {
    let current = first;
    const run: Session = {
      runId: "run",
      missionId: "mission",
      phase: "terminal",
      startedAt: 10,
      completionResponse: "Delivered",
      channelId: "actual-channel",
      contextId: "actual-context",
    };
    runtime.call.mockImplementation(
      async (method: string, input?: { changes?: Partial<Task> }) => {
        if (method === "overview") return overview([current]);
        if (method === "taskDetail") return detail(current, [run]);
        if (method === "updateTask") {
          current = {
            ...current,
            ...input?.changes,
            revision: current.revision + 1,
          };
          return current;
        }
        return undefined;
      },
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Show chat links" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Open conversation" }),
    );
    await waitFor(() =>
      expect(runtime.openPanel).toHaveBeenCalledWith(
        "panels/chat",
        expect.objectContaining({
          contextId: "actual-context",
          stateArgs: expect.objectContaining({ channelName: "actual-channel" }),
        }),
      ),
    );
    expect(current.historyMode).toBe("conversation");
  });

  it("routes lifecycle cancellation through task controls instead of the brief form", async () => {
    const running: Task = {
      ...first,
      status: "active",
      automationId: "mission",
    };
    runtime.call.mockImplementation(async (method: string) =>
      method === "overview"
        ? overview([running])
        : method === "taskDetail"
          ? detail(running)
          : method === "taskOptions"
            ? { tasks: [], cursor: null }
            : undefined,
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit First mission" }),
    );
    const dialog = screen.getByRole("dialog");
    const status = within(dialog).getByRole("combobox", { name: "Status" });
    expect(
      within(status).queryByRole("option", { name: "Cancelled" }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Move task" }), {
      target: { value: "cancelled" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith("cancelTask", {
        id: first.id,
        expectedRevision: first.revision,
      }),
    );
    expect(
      runtime.call.mock.calls.some(([method]) => method === "updateTask"),
    ).toBe(false);
  });

  it("shows cancelled cards on the default board and allows reopening them", async () => {
    let current: Task = {
      ...first,
      status: "cancelled",
      automationId: "mission",
    };
    runtime.call.mockImplementation(
      async (method: string, input?: { changes?: Partial<Task> }) => {
        if (method === "overview")
          return {
            ...overview([current]),
            total: 1,
            counts: {
              inbox: 0,
              ready: current.status === "ready" ? 1 : 0,
              active: 0,
              review: 0,
              done: 0,
              cancelled: current.status === "cancelled" ? 1 : 0,
            },
          };
        if (method === "taskDetail") return detail(current);
        if (method === "updateTask") {
          current = {
            ...current,
            ...input?.changes,
            revision: current.revision + 1,
          };
          return current;
        }
        return undefined;
      },
    );
    await open();
    const cancelledColumn = screen.getByRole("region", { name: "Cancelled" });
    fireEvent.click(
      within(cancelledColumn).getByRole("button", { name: "First mission" }),
    );
    const status = await screen.findByRole("combobox", { name: "Move task" });
    expect((status as HTMLSelectElement).value).toBe("cancelled");
    fireEvent.change(status, { target: { value: "ready" } });
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith("updateTask", {
        id: first.id,
        expectedRevision: first.revision,
        changes: { status: "ready" },
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Move task",
          }) as HTMLSelectElement
        ).value,
      ).toBe("ready"),
    );
    expect(
      within(screen.getByRole("region", { name: "Ready" })).getByRole(
        "button",
        { name: "First mission" },
      ),
    ).toBeTruthy();
  });

  it("enables commands only after the initial authoritative snapshot settles", async () => {
    let resolveOverview!: (value: Overview) => void;
    runtime.call.mockImplementation((method: string) =>
      method === "overview"
        ? new Promise<Overview>((resolve) => {
            resolveOverview = resolve;
          })
        : Promise.resolve({ tasks: [], cursor: null }),
    );
    render(<MissionControl />);
    const commands = [
      screen.getByRole("button", { name: "New task" }),
      screen.getByRole("button", { name: "New project" }),
      screen.getByRole("button", { name: "Create project" }),
      screen.getByRole("button", { name: /All missions/ }),
      screen.getByRole("button", { name: "Filter" }),
      screen.getByRole("button", { name: "Save current view" }),
      screen.getByRole("button", { name: "List view" }),
      screen.getByRole("button", { name: "Talk to mission lead" }),
      screen.getByRole("button", { name: "Open mission lead conversation" }),
    ] as HTMLButtonElement[];
    expect(commands.every((button) => button.disabled)).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Search tasks",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Idea for mission lead",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Gathering your missions…")).toBeTruthy();
    expect(screen.queryByText("Your next chapter starts here.")).toBeNull();
    expect(screen.queryByText("Your first project starts here.")).toBeNull();
    expect(screen.queryByText("Save a useful slice of your work.")).toBeNull();
    fireEvent.click(commands[0]!);
    fireEvent.click(commands[1]!);
    fireEvent.click(commands[7]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(runtime.call.mock.calls.map(([method]) => method)).toEqual([
      "overview",
    ]);
    await act(async () => resolveOverview(overview()));
    expect(commands.every((button) => !button.disabled)).toBe(true);
    expect(screen.getByRole("button", { name: "First mission" })).toBeTruthy();
    expect(
      runtime.call.mock.calls.filter(([method]) => method === "overview"),
    ).toHaveLength(1);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "New task" })),
    );
    expect(
      screen.getByRole("dialog", { name: "Give your agent a clear mission" }),
    ).toBeTruthy();
  });

  it("keeps refresh actionable when the initial snapshot rejects", async () => {
    let rejectOverview!: (error: Error) => void;
    runtime.call.mockImplementationOnce(
      () =>
        new Promise<Overview>((_resolve, reject) => {
          rejectOverview = reject;
        }),
    );
    render(<MissionControl />);
    await act(async () =>
      rejectOverview(new Error("Workspace source unavailable")),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Workspace source unavailable",
    );
    expect(screen.getByText("Couldn’t load your missions.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "New task" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const retry = screen.getByRole("button", {
      name: "Refresh mission control",
    });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "First mission" });
    expect(
      (screen.getByRole("button", { name: "New task" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      runtime.call.mock.calls.filter(([method]) => method === "overview"),
    ).toHaveLength(2);
  });

  it("retains a quick capture draft after a failed save and clears it after success", async () => {
    let fail = true;
    runtime.call.mockImplementation(async (method: string) => {
      if (method === "overview") return overview();
      if (method === "createTask" && fail)
        throw new Error("Project changed while saving");
      return first;
    });
    await open();
    const input = screen.getByRole("textbox", { name: "Quick task title" });
    fireEvent.change(input, { target: { value: "New idea" } });
    fireEvent.click(screen.getByRole("button", { name: /Capture/ }));
    await screen.findByText("Project changed while saving");
    expect((input as HTMLInputElement).value).toBe("New idea");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /Capture/ }));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    expect(runtime.call).toHaveBeenCalledWith("createTask", {
      projectId: project.id,
      title: "New idea",
      status: "inbox",
    });
  });

  it("updates the checklist with the live revision and retains note drafts on failure", async () => {
    let current = {
      ...first,
      checklist: [{ id: "accept", text: "Validate delivery", done: false }],
    };
    runtime.call.mockImplementation(
      async (method: string, input?: { changes?: Partial<Task> }) => {
        if (method === "overview") return overview([current]);
        if (method === "taskDetail") return detail(current);
        if (method === "updateTask") {
          current = {
            ...current,
            ...input?.changes,
            revision: current.revision + 1,
          };
          return current;
        }
        if (method === "addNote") throw new Error("Note could not be recorded");
        return undefined;
      },
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Validate delivery" }),
    );
    await waitFor(() => expect(current.checklist[0]?.done).toBe(true));
    expect(runtime.call).toHaveBeenCalledWith("updateTask", {
      id: first.id,
      expectedRevision: 1,
      changes: {
        checklist: [{ id: "accept", text: "Validate delivery", done: true }],
      },
    });
    const note = screen.getByRole("textbox", { name: "Add a note" });
    fireEvent.change(note, { target: { value: "Keep this decision" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByText("Note could not be recorded");
    expect((note as HTMLTextAreaElement).value).toBe("Keep this decision");
  });

  it("reports partial bulk failures and retains only the failed selection", async () => {
    runtime.call.mockImplementation(
      async (method: string, input?: { id?: string }) => {
        if (method === "overview") return overview([first, second]);
        if (method === "getTask") return input?.id === "two" ? second : first;
        if (method === "updateTask" && input?.id === "two")
          throw new Error("Second card changed");
        return first;
      },
    );
    await open();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select 2 loaded tasks" }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Set selected priority" }),
      { target: { value: "high" } },
    );
    await screen.findByText(
      /1 updated; 1 could not be updated: Second card changed/,
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select First mission",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Second mission",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(runtime.call).toHaveBeenCalledWith("updateTask", {
      id: first.id,
      expectedRevision: 1,
      changes: { priority: "high" },
    });
  });

  it("removes one filter chip while retaining the rest of the shared view", async () => {
    let view = {
      ...emptyView(),
      due: "today" as const,
      execution: "linked" as const,
      tag: "launch",
    };
    runtime.call.mockImplementation(
      async (method: string, input?: typeof view) => {
        if (method === "overview") return { ...overview(), view };
        if (method === "setView") {
          view = input!;
          return view;
        }
        return undefined;
      },
    );
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter Due: today" }),
    );
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith("setView", {
        ...emptyView(),
        due: "any",
        execution: "linked",
        tag: "launch",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Remove filter Has execution" }),
    ).toBeTruthy();
  });

  it("opens commands with the keyboard without hijacking normal task typing", async () => {
    await open();
    const input = screen.getByRole("textbox", { name: "Quick task title" });
    fireEvent.keyDown(input, { key: "n" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    const search = screen.getByRole("textbox", { name: "Find a command" });
    fireEvent.change(search, { target: { value: "Launch" } });
    fireEvent.click(screen.getByRole("button", { name: /Launch.*Project/ }));
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        "setView",
        expect.objectContaining({ projectId: project.id }),
      ),
    );
  });

  it("exports the complete filtered view through pagination", async () => {
    let calls = 0;
    runtime.call.mockImplementation(
      async (method: string, input?: { cursor?: unknown }) => {
        if (method === "overview") {
          calls++;
          return input?.cursor ? overview([second]) : overview([first], "next");
        }
        return undefined;
      },
    );
    const create = vi.fn((_blob: Blob) => "blob:export");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: create,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await screen.findByText(
      "Exported 2 tasks from the complete filtered view.",
    );
    expect(calls).toBe(3);
    expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:export");
    click.mockRestore();
  });

  it("undoes a card move against its returned revision rather than overwriting concurrent edits", async () => {
    let current = first;
    runtime.call.mockImplementation(
      async (
        method: string,
        input?: { expectedRevision?: number; changes?: Partial<Task> },
      ) => {
        if (method === "overview") return overview([current]);
        if (method === "taskDetail") return detail(current);
        if (method === "updateTask") {
          if (input?.expectedRevision !== current.revision)
            throw new Error(
              "This card changed. Refresh before saving your edit.",
            );
          current = {
            ...current,
            ...input.changes,
            revision: current.revision + 1,
          };
          return current;
        }
        return undefined;
      },
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    const move = await screen.findByRole("combobox", { name: "Move task" });
    fireEvent.change(move, { target: { value: "ready" } });
    const undo = await screen.findByRole("button", {
      name: "Undo edit: First mission",
    });
    current = {
      ...current,
      revision: current.revision + 1,
      description: "Concurrent human edit",
    };
    fireEvent.click(undo);
    await screen.findByText(
      "This card changed. Refresh before saving your edit.",
    );
    expect(runtime.call).toHaveBeenLastCalledWith("taskDetail", {
      id: first.id,
    });
    const updates = runtime.call.mock.calls.filter(
      ([method]) => method === "updateTask",
    );
    expect(updates.at(-1)?.[1]).not.toHaveProperty("title");
    expect(current.description).toBe("Concurrent human edit");
    expect(current.status).toBe("ready");
    expect(runtime.call).toHaveBeenCalledWith("updateTask", {
      id: first.id,
      expectedRevision: 2,
      changes: { status: "inbox" },
    });
  });
  it("keeps planning usable while a task launch owns an unresolved approval", async () => {
    const ready = { ...first, status: "ready" as const };
    let rejectLaunch!: (error: Error) => void;
    let view = emptyView();
    runtime.call.mockImplementation(
      async (method: string, input?: typeof view) => {
        if (method === "overview") return { ...overview([ready]), view };
        if (method === "taskDetail") return detail(ready);
        if (method === "startTask")
          return new Promise<Session>((_resolve, reject) => {
            rejectLaunch = reject;
          });
        if (method === "setView") {
          view = input!;
          return view;
        }
        return undefined;
      },
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "First mission" }));
    const inspector = await screen.findByRole("complementary", {
      name: "Task details",
    });
    fireEvent.click(
      within(inspector).getByRole("button", { name: "Start agent" }),
    );
    await screen.findByText(
      "1 operation in progress. Planning stays available.",
    );
    expect(
      (screen.getByRole("button", { name: "New task" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        "setView",
        expect.objectContaining({ layout: "list" }),
      ),
    );
    expect(
      screen.getByText("1 operation in progress. Planning stays available."),
    ).toBeTruthy();
    await act(async () => rejectLaunch(new Error("Launch approval denied")));
    await screen.findByText("Launch approval denied");
    expect(
      screen.queryByText("1 operation in progress. Planning stays available."),
    ).toBeNull();
    expect(ready.status).toBe("ready");
  });
  it("does not invite duplicate creation when a committed capture cannot refresh", async () => {
    let reads = 0;
    runtime.call.mockImplementation(async (method: string) => {
      if (method === "overview") {
        if (++reads > 1) throw new Error("Read channel disconnected");
        return overview();
      }
      if (method === "createTask") return first;
      return undefined;
    });
    await open();
    const input = screen.getByRole("textbox", { name: "Quick task title" });
    fireEvent.change(input, { target: { value: "Committed idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture task" }));
    await screen.findByText(
      "Operation completed, but the view could not refresh: Read channel disconnected",
    );
    expect((input as HTMLInputElement).value).toBe("");
    expect(
      runtime.call.mock.calls.filter(([method]) => method === "createTask"),
    ).toHaveLength(1);
  });
});
