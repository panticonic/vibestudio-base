import { describe, expect, it } from "vitest";
import {
  executionPrompt,
  projectInput,
  taskInput,
  viewInput,
  dueDayBounds,
  type Task,
} from "./index.js";

function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    ...taskInput.parse({ projectId: "project-a", title: id }),
    id,
    revision: 1,
    automationId: null,
    createdAt: 1,
    updatedAt: 1,
    ...changes,
  };
}

describe("Mission Control input and view contracts", () => {
  it("normalizes labels and repository selections while rejecting paths outside workspace sources", () => {
    expect(
      projectInput.parse({
        name: "  Launch  ",
        repos: ["projects/website", "projects/website", "packages/shared"],
      }),
    ).toMatchObject({
      name: "Launch",
      repos: ["projects/website", "packages/shared"],
      description: "",
      color: "violet",
    });
    for (const repo of [
      "/projects/site",
      "projects/../private",
      "node_modules/tool",
      "projects/site/../../private",
    ]) {
      expect(() =>
        projectInput.parse({ name: "Launch", repos: [repo] }),
      ).toThrow();
    }
    expect(
      taskInput.parse({
        projectId: "project-a",
        title: "  Ship  ",
        tags: [" ui ", "ui", "review"],
      }),
    ).toMatchObject({
      title: "Ship",
      tags: ["ui", "review"],
      status: "inbox",
      priority: "normal",
      historyMode: "overview",
      dependencies: [],
      dueAt: null,
    });
    expect(() =>
      taskInput.parse({ projectId: "project-a", title: " ", extra: true }),
    ).toThrow();
  });

  it("keeps the execution charter stable across card edits and requires the live card before work", () => {
    const card = task("task-1", {
      title: "Old title",
      description: "Old scope",
    });
    const prompt = executionPrompt(card);
    const edited = {
      ...card,
      title: "New title",
      description: "New scope",
      revision: 2,
    };
    expect(executionPrompt(edited)).toBe(prompt);
    expect(prompt).toContain('taskDetail with {id:"task-1"}');
    expect(prompt).toContain("expectedRevision");
    expect(prompt).toContain("dependency");
    expect(prompt).not.toContain("Old scope");
    expect(prompt).not.toContain("New scope");
  });
});

describe("Mission Control checklist and calendar contracts", () => {
  it("normalizes checklist steps and rejects ambiguous duplicate identities", () => {
    const input = {
      projectId: "p",
      title: "Plan",
      checklist: [{ id: "a", text: "  Verify launch  " }],
    };
    expect(taskInput.parse(input).checklist).toEqual([
      { id: "a", text: "Verify launch", done: false },
    ]);
    expect(
      taskInput.parse({ projectId: "p", title: "Plan" }).checklist,
    ).toEqual([]);
    expect(() =>
      taskInput.parse({
        ...input,
        checklist: [...input.checklist, ...input.checklist],
      }),
    ).toThrow(/unique/i);
    expect(() =>
      taskInput.parse({ ...input, checklist: [{ id: "a", text: " " }] }),
    ).toThrow();
  });

  it("defaults new view fields and validates an explicit calendar timezone", () => {
    expect(viewInput.parse({})).toMatchObject({
      due: "any",
      execution: "any",
      blocked: false,
      timezone: "UTC",
    });
    expect(
      viewInput.parse({ timezone: " Europe/Berlin ", layout: "agenda" }),
    ).toMatchObject({ timezone: "Europe/Berlin", layout: "agenda" });
    expect(() => viewInput.parse({ timezone: "not/a-zone" })).toThrow(
      /timezone/i,
    );
  });

  it.each([
    [
      "Europe/Berlin",
      "2026-03-29T12:00:00Z",
      "2026-03-28T23:00:00Z",
      "2026-03-29T22:00:00Z",
    ],
    [
      "Europe/Berlin",
      "2026-10-25T12:00:00Z",
      "2026-10-24T22:00:00Z",
      "2026-10-25T23:00:00Z",
    ],
    [
      "Asia/Kathmandu",
      "2026-10-02T12:00:00Z",
      "2026-10-01T18:15:00Z",
      "2026-10-02T18:15:00Z",
    ],
    [
      "Pacific/Kiritimati",
      "2026-10-02T12:00:00Z",
      "2026-10-02T10:00:00Z",
      "2026-10-03T10:00:00Z",
    ],
    [
      "America/Sao_Paulo",
      "2018-11-04T12:00:00Z",
      "2018-11-04T03:00:00Z",
      "2018-11-05T02:00:00Z",
    ],
  ])(
    "uses the actual civil-day boundaries in %s on %s",
    (timezone, now, today, tomorrow) => {
      expect(dueDayBounds(Date.parse(now), timezone)).toMatchObject({
        today: Date.parse(today),
        tomorrow: Date.parse(tomorrow),
      });
    },
  );
});
