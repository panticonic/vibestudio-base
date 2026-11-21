import { expect, it } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProgramLoader } from "./programs.js";
import { createNatlangRuntime, workerdPlatform } from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import { testNewFunction } from "./testSupport.js";

it("passes real document records to the linked revision and reconciliation policies", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const scripts: Record<string, string> = {
    runUserGoal: "return await reviseWorkspaceDocument(goal, null);",
    reviseWorkspaceDocument: `
      const original = await goalWorkspace.read("staff-guide.md");
      if (!original) throw new Error("Missing document");
      const proposal = await policy.chooseRevision(goal, [original], research);
      if (!proposal) throw new Error("Missing proposal");
      const first = await goalWorkspace.revise(proposal.path, proposal.version, proposal.text);
      if (first.status !== "changed") throw new Error("Expected concurrent revision");
      const latest = await goalWorkspace.read(original.path);
      if (!latest) throw new Error("Missing current revision");
      const text = await policy.reconcileRevision(goal, original, proposal.text, latest, [latest], research);
      if (!text) throw new Error("Missing reconciled text");
      const write = await goalWorkspace.revise(latest.path, latest.version, text);
      if (write.status !== "written") throw new Error("Failed revision");
      return {status:"edited", path:latest.path, version:write.version};
    `,
    chooseRevision: 'return {...documents[0]!, text:"Doors open: 10:45\\n"};',
    reconcileRevision: 'return proposedText + latest.text.slice(original.text.length);',
  };
  const steps: string[] = [];
  const runtime = createNatlangRuntime({ platform, agent: async session => {
    const name = session.lam.functionName!;
    steps.push(name);
    expect(scripts[name]).toBeDefined();
    const action = await session.applyAsync("eval", { code: scripts[name]!, finish: true });
    if (action.kind !== "completed") throw new Error(action.text);
  } });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: path => readFile(join(root, path), "utf8"),
      readdir: path => readdir(join(root, path), { withFileTypes: true }),
      stat: path => stat(join(root, path)),
    },
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  const path = "staff-guide.md";
  let current = {path, version:"initial", text:"Doors open: 10:00\n"};
  const run = await loader.load("skills/open-user-goal/runUserGoal.nl", { services: {
    goalWorkspace: {
      list: async () => [path],
      read: async (name: string) => name === path ? current : null,
      revise: async (name: string, version: string, text: string) => {
        if (name !== path || version !== current.version) throw new Error("Incorrect revision basis");
        if (version === "initial") {
          current = {...current, version:"concurrent", text:current.text + "Keep the accessible door clear.\n"};
          return {status:"changed"};
        }
        current = {path, version:"updated", text};
        return {status:"written", version:current.version};
      },
    },
  } }) as (goal: string) => Promise<unknown>;
  await expect(run("Update the staff guide opening time.")).resolves.toEqual({status:"edited",path,version:"updated"});
  expect(current.text).toBe("Doors open: 10:45\nKeep the accessible door clear.\n");
  expect(steps).toEqual(["runUserGoal", "reviseWorkspaceDocument", "chooseRevision", "reconcileRevision"]);
});
