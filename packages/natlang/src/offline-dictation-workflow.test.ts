import { expect, it } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProgramLoader } from "./programs.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../vendor/workerd/natlang-workerd.js";
import { confinedRealm } from "./realm.js";
import { testNewFunction } from "./testSupport.js";

it("uses the mounted dictation capture and transcript stages", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const capture = {
    ready: true,
    recording: "valid",
    durationMs: 5000,
    windowed: false,
  };
  const transcript = {
    text: "call Marta tomorrow",
    language: "en",
    model: "whistle",
  };
  const scripts: Record<string, string> = {
    runWorkflow: `
      const report=await domains.dictation.reviewDictation(request.work[0].input);
      return {results:[{kind:"domain",domain:"dictation",operation:"reviewDictation",report}],remaining:[]};
    `,
    reviewDictation: `
      const capture=await dictationCaptureRead.inspect(request.operationId);
      const review=await reviewCapture(capture,request.mode);
      const capturedText=await dictationTranscription.run(request.operationId);
      return {capture,review,transcript:capturedText,draft:await prepareDraft(capturedText,request.presentation,request.goal)};
    `,
    reviewCapture:
      "return {guidance:await reviewRecording(capture),next:await chooseReadiness(capture,mode)};",
    reviewRecording: 'return "Recorded "+capture.durationMs+" milliseconds";',
    chooseReadiness:
      'return capture.ready&&mode==="transcribe"?"transcribe":"ready";',
    prepareDraft: `
      if(await checkTranscript(capturedText)==="silence")return {status:"silence",text:null};
      return {status:"draft",text:await formatDraft(capturedText,presentation,goal)};
    `,
    checkTranscript: 'return capturedText.text.trim()?"speech":"silence";',
    formatDraft:
      'return presentation==="verbatim"?capturedText.text:capturedText.text+".";',
  };
  const stages: string[] = [];
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName!;
      stages.push(name);
      expect(Object.keys(session.availableServices())).toEqual(
        name === "reviewDictation"
          ? ["dictationCaptureRead", "dictationTranscription"]
          : [],
      );
      const code = scripts[name];
      if (!code) throw new Error("Unexpected dictation stage " + name);
      const result = await session.applyAsync("eval", { code, finish: true });
      if (result.kind === "rejected") throw new Error(result.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    bindings: {},
    runTask: (run, task) => runtime.run(run, task),
  });
  const reads: string[] = [];
  const run = (await loader.load("skills/vibestudio-workflows/runWorkflow.nl", {
    services: {
      dictationCaptureRead: {
        async inspect(id: string) {
          reads.push(id);
          return capture;
        },
      },
      dictationTranscription: {
        async run(id: string) {
          reads.push(id);
          return transcript;
        },
      },
    },
  })) as (value: unknown) => Promise<unknown>;
  const input = {
    goal: "Create a punctuated draft",
    operationId: "assigned-dictation",
    mode: "transcribe",
    presentation: "punctuated",
  };
  await expect(
    run({
      goal: input.goal,
      work: [
        {
          kind: "domain",
          domain: "dictation",
          operation: "reviewDictation",
          input,
        },
      ],
    }),
  ).resolves.toMatchObject({
    results: [
      {
        report: {
          capture,
          transcript,
          review: { next: "transcribe" },
          draft: { status: "draft", text: "call Marta tomorrow." },
        },
      },
    ],
  });
  expect(reads).toEqual([input.operationId, input.operationId]);
  expect(stages).toEqual([
    "runWorkflow",
    "reviewDictation",
    "reviewCapture",
    "reviewRecording",
    "chooseReadiness",
    "prepareDraft",
    "checkTranscript",
    "formatDraft",
  ]);
});
