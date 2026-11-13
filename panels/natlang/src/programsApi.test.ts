import { describe, expect, it } from "vitest";
import { nlFiles, programFolders, programsApi } from "./programsApi.js";
import { fakePorts, memoryFs } from "./testSupport.js";

const TRIAGE = "---\ndescription: Decide whether a ticket is urgent.\nargs:\n  ticket: string\nreturns: string\n---\nDecide.\n";

const description = {
  root: "skills/triage",
  services: ["serverLog"],
  functions: [
    {
      name: "classify",
      source: "classify.nl",
      description: "Decide whether a ticket is urgent.",
      params: ["ticket: string"],
      returns: "string",
      fields: [{ name: "ticket", type: "string", text: "string", required: true, tree: { kind: "prim", name: "string" } }],
      result: { name: "expected result", type: "string", text: "string", required: true, tree: { kind: "prim", name: "string" } },
    },
  ],
};

const WORKSPACE = {
  "skills/triage/classify.nl": TRIAGE,
  "skills/triage/classify/helper.nl": TRIAGE,
  "skills/triage/package.json": '{"name":"@workspace-skills/triage","version":"0.1.0","description":"Triage tickets."}',
  "skills/triage/README.md": "# Triage\nHow it works.",
  "skills/notes/SKILL.md": "not a program",
  "projects/natlang/mine/mine.nl": TRIAGE,
  "packages/lib/natlang.d/dir.nl": TRIAGE,
  "packages/lib/src/index.ts": "export {}",
  "skills/triage/node_modules/x/dep.nl": TRIAGE,
};

describe("program discovery", () => {
  it("lists .nl files with one recursive request per root, skipping node_modules and hidden folders", async () => {
    const requests: string[] = [];
    const fs = memoryFs({ ...WORKSPACE, "skills/triage/.natlang/cache.nl": "x" });
    const readdir = fs.readdir;
    fs.readdir = ((path: string, options: unknown) => (requests.push(path), (readdir as any)(path, options))) as never;
    expect(await nlFiles(fs)).toEqual([
      "packages/lib/natlang.d/dir.nl",
      "projects/natlang/mine/mine.nl",
      "skills/triage/classify.nl",
      "skills/triage/classify/helper.nl",
    ]);
    expect(requests).toEqual(["skills", "projects", "packages"]);
  });

  it("finds the folders that directly hold .nl files, once per program, with their function counts", async () => {
    expect(programFolders(await nlFiles(memoryFs(WORKSPACE)))).toEqual([
      { directory: "packages/lib/natlang.d", functions: 1 },
      { directory: "projects/natlang/mine", functions: 1 },
      { directory: "skills/triage", functions: 2 },
    ]);
  });
});

describe("programsApi", () => {
  it("lists programs with their names, descriptions and function counts", async () => {
    const { ports } = fakePorts({ files: WORKSPACE });
    const list = await programsApi(ports).list();
    expect(list.find((program) => program["directory"] === "skills/triage")).toMatchObject({
      name: "triage",
      description: "Triage tickets.",
      functions: 2,
      targets: [],
    });
    expect(list.find((program) => program["directory"] === "projects/natlang/mine")).toMatchObject({ name: "mine", functions: 1 });
  });

  it("describes a program from the provider's own compilation, in this panel's eval session", async () => {
    const { ports, evaluated } = fakePorts({ files: WORKSPACE, handle: () => ({ success: true, console: "", returnValue: description }) });
    const detail = await programsApi(ports).detail("skills/triage");
    expect(evaluated.map((run) => run.source)).toEqual(['return await natlang.describe("skills/triage");']);
    expect(detail).toMatchObject({
      directory: "skills/triage",
      manifest: { name: "triage", version: "0.1.0", description: "Triage tickets.", targets: {} },
      problem: null,
      services: ["serverLog"],
      examples: 0,
      readme: { name: "README.md" },
    });
    expect(detail["functions"][0].fields[0]).toMatchObject({ name: "ticket", required: true });
  });

  it("reports a program that does not compile as its problem and still shows the rest", async () => {
    const { ports } = fakePorts({
      files: WORKSPACE,
      handle: () => ({ success: false, console: "", error: "natlang program skills/triage does not compile:\nclassify.nl:1 bad type" }),
    });
    const detail = await programsApi(ports).detail("skills/triage");
    expect(detail["problem"]).toMatch(/does not compile/);
    expect(detail["functions"]).toEqual([]);
    expect(detail["manifest"].name).toBe("triage");
  });

  it("refuses paths outside the workspace and folders that do not exist", async () => {
    const { ports } = fakePorts({ files: WORKSPACE });
    const programs = programsApi(ports);
    await expect(programs.detail("../etc")).rejects.toMatchObject({ status: 400 });
    await expect(programs.source("/../secret")).rejects.toMatchObject({ status: 400 });
    await expect(programs.detail("skills/missing")).rejects.toMatchObject({ status: 404 });
  });

  it("reads a source file and saves it only while the file is unchanged since it was read", async () => {
    const { ports, fs } = fakePorts({ files: WORKSPACE });
    const programs = programsApi(ports);
    const source = await programs.source("skills/triage/classify.nl");
    expect(source).toEqual({ path: "skills/triage/classify.nl", text: TRIAGE });
    await programs.saveSource({ path: source.path, text: `${TRIAGE}More.\n`, previous: source.text });
    expect(fs.files["skills/triage/classify.nl"]).toBe(`${TRIAGE}More.\n`);
    // Another writer changed it: the stale editor is refused, and the other change survives.
    fs.files["skills/triage/classify.nl"] = "changed elsewhere";
    await expect(programs.saveSource({ path: source.path, text: "mine", previous: source.text })).rejects.toMatchObject({ status: 409 });
    expect(fs.files["skills/triage/classify.nl"]).toBe("changed elsewhere");
    await expect(programs.saveSource({ path: "skills/triage/README.md", text: "x", previous: "y" })).rejects.toMatchObject({ status: 400 });
    await expect(programs.saveSource({ path: "skills/triage/missing.nl", text: "x", previous: "y" })).rejects.toMatchObject({ status: 400 });
  });

  it("saves examples into examples.json, one per function and input", async () => {
    const { ports, fs } = fakePorts({ files: WORKSPACE });
    const programs = programsApi(ports);
    expect(await programs.saveExample({ path: "skills/triage", example: { function: "classify.nl", inputs: { ticket: "down" }, expected: "urgent" } })).toEqual({ examples: 1 });
    expect(await programs.saveExample({ path: "skills/triage", example: { function: "classify.nl", inputs: { ticket: "down" }, expected: "normal" } })).toEqual({ examples: 1 });
    expect(await programs.saveExample({ path: "skills/triage", example: { function: "classify.nl", inputs: { ticket: "ok" }, expected: "normal" } })).toEqual({ examples: 2 });
    expect(JSON.parse(fs.files["skills/triage/examples.json"]!)).toEqual([
      { function: "classify.nl", inputs: { ticket: "down" }, expected: "normal" },
      { function: "classify.nl", inputs: { ticket: "ok" }, expected: "normal" },
    ]);
    await expect(programs.saveExample({ path: "skills/triage", example: { function: "nope.nl", inputs: {}, expected: 1 } })).rejects.toMatchObject({ status: 404 });
    const detail = await programsApi(fakePorts({ files: fs.files, handle: () => ({ success: true, console: "", returnValue: description }) }).ports).detail("skills/triage");
    expect(detail["examples"]).toBe(2);
  });

  it("creates a program from an instruction under projects/natlang and refuses a taken or invalid name", async () => {
    const { ports, fs } = fakePorts({ files: WORKSPACE });
    const programs = programsApi(ports);
    const created = await programs.create({ name: "summarize-notes", instruction: "Summarize the input in one sentence.", returns: "{ summary: string }" });
    expect(created).toEqual({ directory: "projects/natlang/summarize-notes" });
    expect(fs.files["projects/natlang/summarize-notes/summarize_notes.nl"]).toBe(
      '---\ndescription: "Summarize the input in one sentence."\nargs:\n  input: string\nreturns: { summary: string }\n---\nSummarize the input in one sentence.\n'
    );
    expect(JSON.parse(fs.files["projects/natlang/summarize-notes/package.json"]!)).toEqual({ private: true, type: "module" });
    await expect(programs.create({ name: "summarize-notes" })).rejects.toMatchObject({ status: 409 });
    await expect(programs.create({ name: "../x" })).rejects.toMatchObject({ status: 400 });
  });

  it("lists a folder's entries for path arguments, folders first", async () => {
    const { ports } = fakePorts({ files: WORKSPACE });
    expect(await programsApi(ports).files("skills/triage")).toMatchObject({
      dir: "skills/triage",
      entries: [{ name: "classify", kind: "folder" }, { name: "classify.nl", kind: "file" }, { name: "package.json", kind: "file" }, { name: "README.md", kind: "file" }],
    });
    expect(await programsApi(ports).files("skills/none")).toMatchObject({ missing: true });
  });

  it("restores the last call's inputs from the run host's history", async () => {
    const { ports, evaluated } = fakePorts({ files: WORKSPACE, handle: () => ({ success: true, console: "", returnValue: description }) });
    const detail = await programsApi(ports, { lastCalls: () => ({ "skills/triage/classify.nl": { inputs: { ticket: "x" } } }) }).detail("skills/triage");
    expect(detail["lastCalls"]).toEqual({ "skills/triage/classify.nl": { inputs: { ticket: "x" } } });
    expect(evaluated).toHaveLength(1);
  });
});
