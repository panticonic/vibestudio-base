// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  emptyView,
  type Project,
  type Task,
  type TaskDetail,
} from "@workspace/mission-control";
import { canonicalCronExpression } from "@vibestudio/automation/cronSchedule";
import {
  Filters,
  Modal,
  ProjectForm,
  ScheduleForm,
  TaskForm,
} from "./forms.js";

const runtime = vi.hoisted(() => ({ call: vi.fn(), sourceTree: vi.fn() }));
vi.mock("@workspace/runtime", () => ({
  createDurableObjectServiceClient: () => ({ call: runtime.call }),
  workspace: { sourceTree: runtime.sourceTree },
}));
vi.mock("@workspace/ui/icons", () =>
  Object.fromEntries(
    ["ArrowUpRight", "CalendarClock", "Check", "GitBranch", "Plus", "X"].map(
      (name) => [name, () => null],
    ),
  ),
);

const project: Project = {
  id: "project",
  revision: 1,
  name: "Launch",
  description: "A useful product",
  repos: ["projects/saved"],
  color: "violet",
  archived: false,
  createdAt: 1,
  updatedAt: 1,
};
const task: Task = {
  id: "task",
  revision: 1,
  projectId: project.id,
  title: "Ship the mission",
  description: "Preserve this evidence.",
  status: "ready",
  priority: "normal",
  category: "",
  tags: ["delivery"],
  dependencies: [],
  checklist: [{ id: "step", text: "Existing acceptance", done: true }],
  dueAt: null,
  historyMode: "overview",
  automationId: null,
  createdAt: 1,
  updatedAt: 1,
};
const detail: TaskDetail = {
  task,
  project,
  automation: null,
  runs: [],
  cursor: null,
  dependencies: [],
  activity: [],
  activityCursor: null,
};
const tree = {
  children: [
    { path: "projects/alpha", isUnit: true, children: [] },
    { path: "projects/beta", isUnit: true, children: [] },
  ],
};

beforeEach(() => {
  runtime.call.mockReset();
  runtime.sourceTree.mockReset();
  runtime.call.mockResolvedValue({ tasks: [], cursor: null });
  runtime.sourceTree.mockResolvedValue(tree);
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
});
afterEach(() => cleanup());
const taskForm = (
  submit = vi.fn(),
  overrides: Partial<Parameters<typeof TaskForm>[0]> = {},
) => {
  render(
    <TaskForm
      task={task}
      projects={[project]}
      projectId={project.id}
      defaultStatus="ready"
      close={vi.fn()}
      submit={submit}
      busy={false}
      {...overrides}
    />,
  );
  return submit;
};

describe("Mission Control drafts", () => {
  it("preserves edits when dismissing, resumes focus, and discards only on explicit choice", async () => {
    const close = vi.fn();
    taskForm(undefined, { close });
    const title = screen.getByRole("textbox", { name: "Task title" });
    fireEvent.change(title, { target: { value: "Unsaved title" } });
    title.focus();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      (screen.getByRole("textbox", { name: "Task title" }) as HTMLInputElement)
        .value,
    ).toBe("Unsaved title");
    expect(document.activeElement).toBe(title);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains a failed save as a dirty, retryable draft and uses Ctrl+Enter for the form", async () => {
    const submit = vi.fn();
    const close = vi.fn();
    function FailedSave() {
      const [error, setError] = useState("");
      return (
        <TaskForm
          task={task}
          projects={[project]}
          projectId={project.id}
          defaultStatus="ready"
          close={close}
          busy={false}
          submit={(input) => {
            submit(input);
            setError("The task changed in another session. Review your draft.");
          }}
          error={error}
        />
      );
    }
    render(<FailedSave />);
    const brief = screen.getByRole("textbox", { name: "Brief" });
    fireEvent.change(brief, { target: { value: "My revised brief" } });
    fireEvent.keyDown(brief, { key: "Enter", ctrlKey: true });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ description: "My revised brief" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("another session");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      (screen.getByRole("textbox", { name: "Brief" }) as HTMLTextAreaElement)
        .value,
    ).toBe("My revised brief");
  });

  it("gives layered dialogs distinct accessible headings", () => {
    render(
      <>
        <Modal title="Project settings" close={vi.fn()}>
          <p>Project</p>
        </Modal>
        <Modal title="Confirm archive" close={vi.fn()}>
          <p>Confirm</p>
        </Modal>
      </>,
    );
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs[0]?.getAttribute("aria-labelledby")).not.toBe(
      dialogs[1]?.getAttribute("aria-labelledby"),
    );
    expect(
      screen.getByRole("dialog", { name: "Confirm archive" }),
    ).toBeTruthy();
  });
});

describe("Mission Control planning forms", () => {
  it("retries repository discovery and preserves saved selections outside the search", async () => {
    runtime.sourceTree.mockRejectedValueOnce(
      new Error("Workspace tree unavailable"),
    );
    const submit = vi.fn();
    render(
      <ProjectForm
        project={project}
        close={vi.fn()}
        submit={submit}
        busy={false}
        archive={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry repository discovery" }),
    );
    await screen.findByText("projects/alpha");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find repositories" }),
      { target: { value: "alpha" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select all matching" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove repository projects/saved" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ repos: ["projects/saved", "projects/alpha"] }),
    );
    expect(runtime.sourceTree).toHaveBeenCalledTimes(2);
  });

  it("treats repository search as navigation rather than an unsaved edit", async () => {
    const close = vi.fn();
    render(
      <ProjectForm
        project={project}
        close={close}
        submit={vi.fn()}
        busy={false}
        archive={vi.fn()}
      />,
    );
    await screen.findByText("projects/alpha");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find repositories" }),
      { target: { value: "alpha" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("appends brief outlines and saves pending tags and acceptance steps without dropping existing progress", async () => {
    const submit = taskForm();
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    const brief = screen.getByRole("textbox", {
      name: "Brief",
    }) as HTMLTextAreaElement;
    expect(brief.value).toMatch(/^Preserve this evidence\.\n\n## Question/);
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), {
      target: { value: "research, evidence" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "New checklist item" }),
      { target: { value: "  Cite primary sources  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["delivery", "research", "evidence"],
        checklist: [
          task.checklist[0],
          expect.objectContaining({
            text: "Cite primary sources",
            done: false,
          }),
        ],
      }),
    );
  });

  it("validates tag and checklist limits before submission and focuses the invalid field", async () => {
    const submit = taskForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), {
      target: { value: "x".repeat(41) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("alert")
        .map((alert) => alert.textContent)
        .join(" "),
    ).toContain("40");
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), {
      target: { value: "" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Checklist item 1" }),
      { target: { value: "" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("alert")
        .map((alert) => alert.textContent)
        .join(" "),
    ).toContain("1");
  });

  it("applies due, timezone, dependency readiness, and agent-link filters together", () => {
    const apply = vi.fn();
    render(
      <Filters
        view={emptyView()}
        apply={apply}
        close={vi.fn()}
        busy={false}
        facets={{ categories: ["Engineering"], tags: ["urgent"] }}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Due" }), {
      target: { value: "today" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Date filter timezone" }),
      { target: { value: "America/New_York" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Agent execution" }),
      { target: { value: "unlinked" } },
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Only tasks blocked by unfinished dependencies",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        due: "today",
        timezone: "America/New_York",
        execution: "unlinked",
        blocked: true,
      }),
    );
  });
});

describe("Mission Control recurring schedules", () => {
  it("uses canonical calendar presets and blocks invalid IANA zones without losing the draft", async () => {
    const submit = vi.fn();
    render(
      <ScheduleForm
        detail={detail}
        close={vi.fn()}
        submit={submit}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    fireEvent.change(screen.getByLabelText("Run at"), {
      target: { value: "14:30" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Timezone" }), {
      target: { value: "Unknown/Place" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("combobox", { name: "Timezone" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Timezone" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Timezone" }), {
      target: { value: "Europe/Berlin" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Maximum lifetime runs" }),
      { target: { value: "5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    expect(submit).toHaveBeenCalledWith({
      kind: "cron",
      expression: canonicalCronExpression("30 14 * * *"),
      timezone: "Europe/Berlin",
      maxRuns: 5,
    });
    const preview = screen.getByRole("region", { name: "Automation preview" });
    expect(within(preview).getAllByRole("listitem")).toHaveLength(3);
  });

  it("rejects malformed cron and sub-minute intervals at the canonical trigger boundary", async () => {
    const submit = vi.fn();
    render(
      <ScheduleForm
        detail={detail}
        close={vi.fn()}
        submit={submit}
        busy={false}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Calendar expression" }),
      { target: { value: "this is not cron" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("textbox", { name: "Calendar expression" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "Repeat" }), {
      target: { value: "schedule" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Interval in minutes" }),
      { target: { value: "0.5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("spinbutton", { name: "Interval in minutes" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hourly" }));
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        kind: "schedule",
        everyMs: 3600000,
      }),
    );
  });
});
