import {
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepare } from "../scratch-handoff/handoffChecks.js";
import { bindScratchHandoff, maxScratchArtifactBytes } from "./index.js";

it("writes exact UTF-8 into a fresh scratch directory without touching the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibe-scratch-workflow-test-"));
  try {
    const source = join(root, "original.txt");
    const next = "Approuvé : aperçu « Été ».\r\n";
    await writeFile(source, next);
    const binding = bindScratchHandoff(
      {
        open,
        rename,
        rm,
        writeFile,
        mkdtemp: (prefix) => mkdtemp(join(root, prefix ?? "scratch")),
      },
      {
        goal: "Stage a release handoff",
        questions: ["What was approved?"],
        sources: [{ id: "review", path: source }],
      },
    );
    expect(await binding.scratchHandoffRead.read("other")).toBeNull();
    const observed = await binding.scratchHandoffRead.read("review");
    expect(observed).toEqual({ id: "review", lines: [next.trimEnd()] });
    const prepareFor = (lastLine: number) =>
      prepare(
        ["What was approved?"],
        [observed!],
        [
          {
            question: 1,
            excerpts: [{ sourceId: "review", firstLine: 1, lastLine }],
          },
        ],
      );
    expect(prepareFor(2)).toEqual({
      body: null,
      unanswered: ["What was approved?"],
    });
    const { body } = prepareFor(1);
    expect(body).toContain(next.trimEnd());
    const staged = await binding.scratchHandoffWrite.stage(body!);
    // The caller can lose the first response after the native write committed.
    expect(await binding.scratchHandoffWrite.stage(body!)).toEqual(staged);
    expect((await readdir(root)).filter(name=>name.startsWith("evidence-handoff"))).toHaveLength(1);
    expect(staged?.bytes).toBe(Buffer.byteLength(body!));
    expect(await readFile(staged!.path, "utf8")).toBe(body);
    expect(await readdir(join(staged!.path, ".."))).toEqual(["handoff.json"]);
    expect(
      await binding.scratchHandoffWrite.stage("overwrite attempt"),
    ).toBeNull();
    expect(await readFile(source, "utf8")).toBe(next);
    await writeFile(staged!.path,"corrupt");
    expect(await binding.scratchHandoffWrite.stage(body!)).toBeNull();
    expect(await readFile(staged!.path,"utf8")).toBe("corrupt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("coalesces exact concurrent staging and retries a failed uncommitted scratch write",async()=>{
 const root=await mkdtemp(join(tmpdir(),"vibe-scratch-retry-test-"));let writes=0,fail=true;
 try{
  const binding=bindScratchHandoff({open,rename,rm,mkdtemp:prefix=>mkdtemp(join(root,prefix??"scratch")),writeFile:async(path,body)=>{writes++;if(fail){fail=false;throw Error("precommit I/O");}await writeFile(path,body);}},
   {goal:"Keep a private note",questions:["What happened?"],sources:[{id:"review",path:join(root,"original.txt")}]});
  expect(await binding.scratchHandoffWrite.stage("native body")).toBeNull();
  const [a,b]=await Promise.all([binding.scratchHandoffWrite.stage("native body"),binding.scratchHandoffWrite.stage("native body")]);
  expect(a).not.toBeNull();expect(b).toEqual(a);expect(writes).toBe(2);
  expect(await binding.scratchHandoffWrite.stage("foreign body")).toBeNull();
 }finally{await rm(root,{recursive:true,force:true});}
});

it("enforces the exported actual artifact bound on UTF-8 bytes at publication and readback",async()=>{
 const root=await mkdtemp(join(tmpdir(),"vibe-scratch-limit-test-"));
 try{
  const source=join(root,"source.txt");await writeFile(source,"Actual owned input");
  const binding=bindScratchHandoff({open,rename,rm,writeFile,mkdtemp:prefix=>mkdtemp(join(root,prefix??"artifact"))},{goal:"Retain the requested private artifact",questions:["What was retained?"],sources:[{id:"source",path:source}]});
  const body="é".repeat(maxScratchArtifactBytes/2);
  expect(Buffer.byteLength(body)).toBe(maxScratchArtifactBytes);
  expect(await binding.scratchHandoffWrite.stage(body+"é")).toBeNull();
  const receipt=await binding.scratchHandoffWrite.stage(body);expect(receipt).not.toBeNull();expect(receipt!.bytes).toBe(maxScratchArtifactBytes);expect(await readFile(receipt!.path,"utf8")).toBe(body);
 }finally{await rm(root,{recursive:true,force:true});}
});
