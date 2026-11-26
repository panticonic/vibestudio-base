/** Actual joint loader and scoped native-port controls; no paid teacher or training data. */
import { expect, it, vi } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createEvalNatlang } from "./index.js";
import { fakeRpc, testNewFunction, toolCallMessage } from "./testSupport.js";
const base = fileURLToPath(new NodeURL("../../..", import.meta.url));
for (const staging of [false, true])
  it(`loads the actual specialist hierarchy and ${staging ? "stages an authorized original/history handoff" : "keeps the answer read-only"}`, async () => {
    const scope = {
      channelId: "owned-channel",
      contextId: "owned-context",
      taskId: "owned-task",
      concern: "canonical reply state",
      parentRevision: "native-parent-event",
      requiredProvider: "local",
      mayStage: staging,
    };
    const index = {
      scope,
      agents: [
        {
          handle: "@actual",
          specialty: scope.concern,
          provider: "local",
          participantId: "native-participant",
          availability: "member",
        },
      ],
    };
    const text = "Original committed reply-state work.",
      digest = createHash("sha256").update(text).digest("hex"),
      original = { text, digest, bytes: Buffer.byteLength(text) };
    const snapshot = {
      channelId: scope.channelId,
      through: 2,
      rows: [
        {
          messageId: "native-attempt",
          envelopeId: "native-attempt-envelope",
          seq: 1,
          record: {
            kind: "attempt",
            handle: "@actual",
            participantId: "native-participant",
            contextId: scope.contextId,
            channelId: scope.channelId,
            taskId: scope.taskId,
            attemptId: "original-attempt",
            provider: "local",
            parentRevision: scope.parentRevision,
            state: "completed",
          },
        },
        {
          messageId: "native-result",
          envelopeId: "native-result-envelope",
          seq: 2,
          record: {
            kind: "result",
            handle: "@actual",
            participantId: "native-participant",
            contextId: scope.contextId,
            taskId: scope.taskId,
            attemptId: "original-attempt",
            provider: "local",
            parentRevision: scope.parentRevision,
            sourceEvent: "original-committed-event",
            sourceState: "committed",
            owner: "workers/agent-worker",
            consumers: ["packages/agentic-core"],
            digest,
          },
        },
      ],
    };
    const membership = vi.fn(async (request) => {
      expect(request).toMatchObject({
        channelId: scope.channelId,
        contextId: scope.contextId,
        handle: "@actual",
        action: "inspect",
        options: null,
      });
      return { state: "member", participantId: "native-participant" };
    });
    const read = vi.fn(async (id: string) => {
      expect(id).toBe(scope.channelId);
      return snapshot;
    });
    const readOriginal = vi.fn(async (channel: string, id: string) => {
      expect([channel, id]).toEqual([scope.channelId, "native-result"]);
      return original;
    });
    const retained = {
      path: "private/native-specialist-brief.json",
      bytes: 201,
      sha256: "native-retained-brief-hash",
    };
    const stage = vi.fn(async (plan, history) => {
      if (!staging) throw Error("A read-only answer cannot stage");
      expect(plan).toMatchObject({
        action: "stage",
        channelId: scope.channelId,
        sourceEvent: "original-committed-event",
        artifact: original,
      });
      expect(history).toMatchObject({
        goal: original.text,
        result: { persistedContract: true },
      });
      return retained;
    });
    const codes = [
      staging
        ? 'const index=await workspace.discoverCurrentSpecialists();const choice=await chooseCurrentSpecialist(goal,index);const evidence=await reviewSpecialistCandidate(goal,index,choice);const history=evidence.result&&evidence.original?await reviewSpecialistHistory(evidence.result,evidence.original):null;const plan=await decideSpecialistHandoff(goal,index,choice,evidence.current,evidence.joined,evidence.original,history);const handoff=plan.action==="stage"&&history?await workspace.stageSpecialistHandoff(plan,history):null;return applicationResult(plan,evidence.membership,history,handoff);'
        : "const index=await workspace.discoverCurrentSpecialists();const choice=await chooseCurrentSpecialist(goal,index);const evidence=await reviewSpecialistCandidate(goal,index,choice);const plan=await decideSpecialistHandoff(goal,index,choice,evidence.current,evidence.joined,evidence.original,null);return applicationResult(plan,evidence.membership,null,null);",
      'return {handle:index.agents[0].handle,reason:"chosen"};',
      'const membership=await inspectSpecialistPresence(goal,index,choice);const current=await workspace.readRetainedSpecialistRun(index.scope.channelId);if(!current)throw Error("No observed run");const joined=await checkSpecialistReceipt(index.scope,choice,current,membership?.report??null);const original=joined.reason==="verified"&&joined.resultMessage?await workspace.readOriginalSpecialistArtifact(index.scope.channelId,joined.resultMessage):null;return bindSpecialistEvidence(index,choice,current,membership,joined,original);',
      'const observed=await inspect(request);return {status:"observed",...observed};',
      'return {attemptMessage:snapshot.rows.find(row=>row.record.kind==="attempt")?.messageId??null,resultMessage:snapshot.rows.find(row=>row.record.kind==="result")?.messageId??null,reason:"verified"};',
      ...(staging
        ? [
            'return {persistedContract:true,retainedHistoryChecks:["Replay retained replies against the changed stored contract."]};',
          ]
        : []),
      `return bindSpecialistPlan({action:"${staging ? "stage" : "report"}",explanation:"The current member's original committed result is verified for the requested local outcome."},index,choice,current,joined,original,history);`,
    ];
    let turns = 0;
    const { rpc } = fakeRpc({
      turn: async (input) => {
        const code = codes[turns++];
        if (!code)
          throw Error(
            "Unexpected semantic call: " + JSON.stringify(input.context),
          );
        return toolCallMessage(
          "eval",
          { code, finish: true },
          { input: 0, output: 0 },
        );
      },
    });
    const runtime = createEvalNatlang({
      newFunction: testNewFunction(),
      owner: { kind: "user", objectKey: "specialist-composition-control" },
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
      const value = await runtime.runCell(
        async () => {
          const natlang = runtime.ambient.natlang as {
            load(path: string, options: object): Promise<unknown>;
          };
          const program = (await natlang.load(
            "skills/open-user-goal/workOnSpecialistHandoffGoal.nl",
            {
              services: {
                ownedSpecialistIndex: { list: async () => index },
                ownedSpecialistRun: { read },
                ownedSpecialistArtifact: { read: readOriginal },
                ownedSpecialistHandoff: { stage },
                channelAgentRead: { read: membership },
                channelAgentAttach: {
                  attach: async () => {
                    throw Error("No attach authorized");
                  },
                },
                channelAgentDetach: {
                  detach: async () => {
                    throw Error("No detach authorized");
                  },
                },
              },
            },
          )) as (goal: string) => Promise<unknown>;
          return program(
            staging
              ? "Stage my local integration brief from the available specialist original committed reply-state work and identify retained-history checks."
              : "Identify the available original specialist and its committed reply-state work. Keep this read-only.",
          );
        },
        {
          runId: "specialist-composition-control",
          signal: new AbortController().signal,
        },
      );
      expect(value.value).toMatchObject({
        plan: {
          handle: "@actual",
          channelId: scope.channelId,
          taskId: scope.taskId,
          through: 2,
          sourceEvent: "original-committed-event",
          artifact: original,
          action: staging ? "stage" : "report",
        },
        membership: { status: "observed", participantId: "native-participant" },
        history: staging ? { result: { persistedContract: true } } : null,
        handoff: staging ? retained : null,
      });
      expect(turns).toBe(staging ? 7 : 6);
      expect(read).toHaveBeenCalledOnce();
      expect(readOriginal).toHaveBeenCalledOnce();
      expect(membership).toHaveBeenCalledOnce();
      if (staging) expect(stage).toHaveBeenCalledOnce();
      else expect(stage).not.toHaveBeenCalled();
    } finally {
      runtime.close();
    }
  }, 180000);
