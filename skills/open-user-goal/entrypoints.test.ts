import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import entries from "./entriesGenerated.js";
import { semanticTaskEntry } from "./entrypoints.js";

it("resolves every declared task family to a typed application entry with actual inputs", () => {
  for (const [kind, descriptor] of Object.entries(entries)) {
    const entry = semanticTaskEntry(kind, "Resolve the user's original request.");
    expect(entry.callable).toBe(descriptor.callable);
    expect(entry.program.endsWith(`/${entry.callable}.nl`)).toBe(true);
    expect(entry.parameterNames).toContain("goal");
    expect(entry.inputValues).toEqual(entry.parameterNames.map(name => entry.arguments[name]));
    expect(Object.fromEntries(Object.entries(entry.argumentJson).map(([name, json]) => [name, JSON.parse(json)]))).toEqual(entry.arguments);
    expect(entry.resultType).not.toBe("UserGoalReport");
    expect(entry.callable).not.toBe("runUserGoal");
  }
  expect(semanticTaskEntry("outcome-workspace", "Answer this", { target: null }).callable).toBe("answerWorkspaceQuestion");
  expect(semanticTaskEntry("outcome-workspace", "Revise this", { target: "notes.md" }).arguments).toEqual({ goal: "Revise this", research: null });
  expect(semanticTaskEntry("vaultKnowledge", "Review the notes")).toEqual(semanticTaskEntry("vaultWork", "Review the notes"));
});

it("keeps the executable catalog identical to the machine-readable source", async () => {
  expect(entries).toEqual(JSON.parse(await readFile(new URL("./entries.json", import.meta.url), "utf8")));
});
