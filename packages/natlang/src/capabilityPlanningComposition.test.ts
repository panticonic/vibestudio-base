/** Actual public loader/compiler/evaluator; semantic responses and native ports are test controls, not training data. */
import { expect, it } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvalNatlang } from "./index.js";
import { fakeRpc, testNewFunction, toolCallMessage } from "./testSupport.js";
const base = fileURLToPath(new URL("../../..", import.meta.url));
it("loads the real capability NL hierarchy and binds semantic choices to native observations without copied witnesses", async () => {
  const head = { kind: "event", eventId: "observed-owned-head" };
  const entry = {
    id: "service:build.actual",
    surface: "service",
    qualifiedName: "build.actual",
    title: "actual",
    sha256: "actual-description-hash",
    argumentNames: ["ref"],
    signature: "(ref: Ref) => Artifact",
    argsSchema: { type: "object" },
    returnsSchema: { type: "object" },
    omittedSchemas: [],
    access: {},
  };
  const knowledge = {
    skillPath: "skills/publishing/SKILL.md",
    sha256: "actual-document-hash",
    revision: {
      state: head,
      repositoryId: "observed-repo",
      fileId: "observed-file",
      contentHash: "observed-content",
    },
    excerpts: [
      {
        heading: "Sources",
        text: "Use the exact immutable source reference for the requested build.",
      },
    ],
  };
  const observations: string[] = [];
  let turns = 0;
  const codes = [
    'const state=await workspace.readPlanningState();const evidence=await workspace.collectCapabilityEvidence(goal,{queries:[{query:"build",surface:"service"}],inventory:false});const plan=await workspace.synthesizeCapabilityPlan(goal,state,evidence);return {plan,handoff:null};',
    "const hits=await docPlanCatalog.search(requests.queries[0]);const selected=await chooseCapabilityEntries(goal,hits);const entries=[];for(const id of selected){const entry=await docPlanCatalog.describe(id);if(entry)entries.push(entry);}return {entries,overview:null};",
    "return hits.map(hit=>hit.id);",
    'const document=await docPlanSkills.load(state.skillIndex[0].dirPath,["exact source"]);if(!document)throw Error("Missing installed guidance");return bindCapabilityPlan({status:"ready",steps:evidence.entries.map(entry=>({id:entry.id,purpose:"Build the requested immutable review artifact."})),rationale:"Planning only; use the immutable source and do not execute the build.",knowledgePaths:[document.skillPath],missing:[],memoDisposition:"none",includeOverview:false},state,evidence,[document]);',
  ];
  const { rpc } = fakeRpc({
    turn: async (input) => {
      const code = codes[turns++];
      if (!code) {
        const context = input.context as {
          messages?: { role?: string; content?: unknown }[];
        };
        throw Error(
          "Unexpected semantic call; last actual tool results: " +
            JSON.stringify(
              context.messages
                ?.filter((m) => m.role === "toolResult")
                .slice(-4)
                .map((m) => String(JSON.stringify(m.content)).slice(0, 1800)),
            ),
        );
      }
      return toolCallMessage(
        "eval",
        { code, finish: true },
        { input: 0, output: 0 },
      );
    },
  });
  const runtime = createEvalNatlang({
    newFunction: testNewFunction(),
    owner: { kind: "user", objectKey: "capability-composition-control" },
    bindings: {
      rpc,
      fs: {
        readFile: (path: string) => readFile(join(base, path), "utf8"),
        readdir: (path: string) =>
          readdir(join(base, path), { withFileTypes: true }),
        stat: (path: string) => stat(join(base, path)),
      },
    },
  });
  try {
    const result = await runtime.runCell(
      async () => {
        const natlang = runtime.ambient.natlang as {
          load(path: string, options: object): Promise<unknown>;
        };
        const program = (await natlang.load(
          "skills/open-user-goal/workOnCapabilityGoal.nl",
          {
            services: {
              docPlanContext: {
                observe: async () => {
                  observations.push("context");
                  return {
                    memo: null,
                    skillIndex: [
                      {
                        name: "publishing",
                        description: "Publish immutable builds",
                        dirPath: "skills/publishing",
                        skillPath: knowledge.skillPath,
                      },
                    ],
                    skillIndexComplete: true,
                    sourceRevision: head,
                    stageAuthorized: false,
                  };
                },
              },
              docPlanCatalog: {
                search: async () => {
                  observations.push("search");
                  return [entry];
                },
                describe: async (id: string) => {
                  expect(id).toBe(entry.id);
                  observations.push("describe");
                  return entry;
                },
                overview: async () => {
                  throw Error("No inventory requested");
                },
                availableMethod: async () => true,
              },
              docPlanSkills: {
                load: async (path: string) => {
                  expect(path).toBe("skills/publishing");
                  observations.push("knowledge");
                  return knowledge;
                },
              },
              docPlanHandoff: {
                stage: async () => {
                  throw Error("Read-only planning cannot stage");
                },
              },
            },
          },
        )) as (goal: string) => Promise<unknown>;
        return program(
          "Identify the build operation and apply installed source guidance; keep this read-only.",
        );
      },
      {
        runId: "capability-composition-control",
        signal: new AbortController().signal,
      },
    );
    expect(turns).toBe(4);
    expect(observations).toEqual([
      "context",
      "search",
      "describe",
      "knowledge",
    ]);
    expect(result.value).toMatchObject({
      plan: {
        sourceRevision: head,
        steps: [
          {
            id: entry.id,
            sha256: entry.sha256,
            argumentNames: entry.argumentNames,
            signature: entry.signature,
          },
        ],
        knowledge: [{ sha256: knowledge.sha256, revision: knowledge.revision }],
        status: "ready",
      },
      handoff: null,
    });
  } finally {
    runtime.close();
  }
}, 180000);
