import { expect, it } from "vitest";
import {createHash} from "node:crypto";
import { readFile } from "node:fs/promises";
import entries, {entryAdapterDefaultsSource} from "./entriesGenerated.js";
import { semanticTaskEntry } from "./entrypoints.js";

it("resolves every declared task family to a typed application entry with actual inputs", () => {
  for (const [kind, descriptor] of Object.entries(entries)) {
    const entry = semanticTaskEntry(kind, "Resolve the user's original request.");
    expect(entry.callable).toBe(descriptor.callable);
    expect([`/${entry.callable}.nl`, `/${entry.callable}.ts`].some(suffix=>entry.program.endsWith(suffix))).toBe(true);
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

it("distinguishes exact source-declared adapter defaults without changing actual executable inputs",async()=>{
 const bytes=await readFile(new URL("./entries.json",import.meta.url));
 const source={path:"skills/open-user-goal/entries.json",sha256:createHash("sha256").update(bytes).digest("hex")};
 expect(entryAdapterDefaultsSource).toEqual(source);
 for(const [kind,descriptor] of Object.entries(entries)){
  const entry=semanticTaskEntry(kind,"Keep the original user goal.");
  const actualArguments={...descriptor.additionalArguments,goal:"Keep the original user goal."};
  expect(entry.arguments).toEqual(actualArguments);
  expect(entry.argumentJson).toEqual(Object.fromEntries(entry.parameterNames.map(name=>[name,JSON.stringify(actualArguments[name as keyof typeof actualArguments])])));
  expect(entry.inputValues).toEqual(entry.parameterNames.map(name=>actualArguments[name as keyof typeof actualArguments]));
  if(Object.keys(descriptor.additionalArguments).length)expect(entry.adapterDefaults).toEqual({values:descriptor.additionalArguments,source});
  else expect(Object.hasOwn(entry,"adapterDefaults")).toBe(false);
 }
 const entry=semanticTaskEntry("workspace-edit","Revise the note");
 entry.adapterDefaults!.values.research={invented:"evidence"};
 expect(entry.arguments.research).toBeNull();
 expect(semanticTaskEntry("workspace-edit","Revise the note").adapterDefaults!.values.research).toBeNull();
 expect(semanticTaskEntry("outcome-workspace","Revise the note",{target:"note.md"}).adapterDefaults?.values).toEqual({research:null});
});
