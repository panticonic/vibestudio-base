import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxToolCall,
  fauxProvider,
  createModels,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { JsonValue } from "@panticonic/pi-chord";
import {
  bindTool,
  bindReceipt,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
  type Storage,
  type HarnessOptions,
  type Conversation,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import type { AgentProductMetadata } from "@workspace/agentic-core/agent-product-metadata";
import { createNativeAutomationRuns } from "./native-automation-runs.js";
import { prepareNativeProductContexts } from "./native-product-context.js";
import { openBoundAgentSession } from "./native-agent-session.js";
import { openNativeChannelConversation } from "./native-channel-session.js";
import { afterEach, describe, expect, it } from "vitest";
import { createNativeChannelPublication } from "./native-channel-publication.js";
import {
  agenticEventSchema,
  type AgenticEvent,
} from "@workspace/agentic-protocol";

const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(context)),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
function automation(
  action: "prompt" | "eval" | "watch" | "tool",
  runId = "run:one",
): NonNullable<AgentProductMetadata["automation"]> {
  return {
    missionId: "mission:one",
    runId,
    ownerUserId: "user:owner",
    name: "Original automation",
    revision: 1,
    action,
    trigger: "scheduled",
    startedAt: 1,
    createdAt: 1,
    authoritySessionNonce: "host-admission:one",
    schedule: null,
  };
}
async function fixture(
  value: JsonValue,
  storage: Storage = new MemoryStorage(),
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const events: AgenticEvent[] = [];
  const publication = createNativeChannelPublication({
    publish: async (_channel, _participant, event) => {
      agenticEventSchema.parse(event);
      events.push(event);
      return event.kind === "message.read"
        ? { recorded: true as const }
        : { id: events.length };
    },
  });
  let harness!: Harness;
  let conversation!: Conversation;
  let pendingStorage: Storage | null = null;
  let failFinish: Error | null = null;
  const finishes: unknown[] = [];
  let calls = 0;
  let failEval: Error | null = null;
  let blockModel = false;
  const evalTool = defineTool({
    name: "eval",
    description: "Actual direct executor",
    parameters: Type.Object({ code: Type.String() }),
    execute: async () => {
      calls++;
      if (failEval) throw failEval;
      return { details: { returnValue: value } };
    },
  });
  const toolCalls: unknown[] = [];
  const selectedTool = defineTool({
    name: "refreshNow",
    version: 1,
    replay: "safe",
    description: "Actual selected tool executor",
    parameters: Type.Object({ briefing: Type.Boolean() }),
    execute: async (args) => {
      toolCalls.push(args);
      return {
        content: [],
        details: value,
      };
    },
  });
  const runs = createNativeAutomationRuns({
    harness: () => harness,
    conversation: async (channelId) => {
      if (channelId !== "channel:one") throw new Error("Unknown owned channel");
      if (pendingStorage) {
        const storage = pendingStorage;
        pendingStorage = null;
        await open(storage);
      }
      return conversation;
    },
    finishRun: async (input) => {
      finishes.push(input);
      if (failFinish) throw failFinish;
    },
  });
  registry.install(
    defineExtension({
      name: "automation",
      tasks: [...runs.tasks, publication.task],
      tools: [evalTool, selectedTool],
    }),
  );
  const options: HarnessOptions & {
    publishWake: NonNullable<HarnessOptions["publishWake"]>;
  } = {
    models,
    registry,
    modelRequests: async (_request, api, ctx) => {
      if (!blockModel)
        return { status: "ready", options: {}, close: async () => {} };
      await api.commit((tx) => bindReceipt(tx, "test:model", "original"), ctx);
      return {
        status: "waiting",
        condition: { kind: "receipt", key: "test:model", binding: "original" },
      };
    },
    publishWake: async () => {},
    prepareCommit: async (tx, staged) => {
      await prepareNativeProductContexts(tx, staged);
      await runs.prepare(tx, staged);
      await publication.prepareCommit(tx, staged);
    },
  };
  async function open(next: Storage) {
    harness = await openBoundAgentSession(
      next,
      {
        runtimeId: "do:workers/agent:Agent:one",
        authoritySessionId: "lifetime:one",
        contextId: "context:one",
        incarnation: "storage:one",
      },
      options,
      context,
    );
    sessions.push(harness);
    conversation = await openNativeChannelConversation(
      harness,
      { channelId: "channel:one", contextId: "context:one", channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:one" } },
      {
        model: { provider: "faux", modelId: "faux-1" },
        tools: [evalTool, selectedTool],
      },
      context,
      (tx, id) =>
        publication.bind(tx, id, {
          channelId: "channel:one",
          participantId: "do:workers/agent:Agent:one",
          actor: { kind: "agent", id: "do:workers/agent:Agent:one" },
          policy: "all",
        }),
    );
  }
  await open(storage);
  return {
    runs,
    faux,
    evalTool,
    selectedTool,
    toolCalls,
    finishes,
    events,
    open,
    activateOnAdmission: (next: Storage) => {
      pendingStorage = next;
    },
    harness: () => harness,
    conversation: () => conversation,
    calls: () => calls,
    blockModel: () => {
      blockModel = true;
    },
    failEval: (error: Error) => {
      failEval = error;
    },
    fail: (error: Error | null) => {
      failFinish = error;
    },
  };
}

describe("native automation ownership", () => {
  it("retains a direct tool's genuine result through reopen without an eval or model turn", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-method-run-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const f = await fixture({ ok: true }, await openNodeSqliteStorage(path));
    const original = automation("tool", "run:method");
    const binding = bindTool(f.selectedTool, "sequential");
    await f.runs.admitTool(
      "channel:one",
      { briefing: false },
      binding,
      original,
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", original.runId, context),
    ).toMatchObject({
      state: "terminal",
      outcome: "succeeded",
    });
    await f.harness().close(context);
    await f.open(await openNodeSqliteStorage(path));
    await f.runs.admitTool(
      "channel:one",
      { briefing: false },
      binding,
      original,
      context,
    );
    await f.harness().runPass(context);
    expect(f.toolCalls).toEqual([{ briefing: false }]);
    expect(f.calls()).toBe(0);
    expect(f.faux.state.callCount).toBe(0);
  });
  it.each(["prompt", "eval", "watch"] as const)(
    "publishes one %s run with public provenance and its actual terminal summary",
    async (action) => {
      const f = await fixture({
        protocol: "automation-signal.v1",
        prompt: null,
      });
      f.faux.setResponses([fauxAssistantMessage("The tick completed.")]);
      const original = automation(action);
      if (action === "prompt")
        await f.runs.admitPrompt(
          "channel:one",
          "Complete this tick",
          original,
          context,
        );
      else
        await f.runs.admitTool(
          "channel:one",
          { code: "actual check" },
          bindTool(f.evalTool, "sequential"),
          original,
          context,
        );
      await f.harness().runPass(context);
      const opened = f.events.filter(
        (event) =>
          event.kind === "turn.opened" &&
          "metadata" in event.payload &&
          event.payload.metadata?.["automation"],
      );
      expect(opened).toHaveLength(1);
      const {
        ownerUserId: _owner,
        authoritySessionNonce: _nonce,
        ...publicSnapshot
      } = original;
      expect(opened[0]?.payload).toMatchObject({
        metadata: { automation: publicSnapshot },
      });
      expect(JSON.stringify(opened[0])).not.toContain("authoritySessionNonce");
      expect(JSON.stringify(opened[0])).not.toContain("ownerUserId");
      const closed = f.events.filter(
        (event) =>
          event.kind === "turn.closed" && event.turnId === opened[0]?.turnId,
      );
      expect(closed).toHaveLength(1);
      expect(closed[0]?.payload).toMatchObject({
        ...(action === "prompt" ? { summary: "The tick completed." } : {}),
      });
      expect(closed[0]?.payload).not.toHaveProperty("reason");
    },
  );
  it.each(["prompt", "watch"] as const)(
    "opens the retained Session before %s admission and preserves deduplication across another cold activation",
    async (kind) => {
      const directory = await mkdtemp(
        join(tmpdir(), "native-automation-cold-"),
      );
      directories.push(directory);
      const path = join(directory, "state.sqlite");
      const f = await fixture(
        { protocol: "automation-signal.v1", prompt: null },
        await openNodeSqliteStorage(path),
      );
      f.faux.setResponses([fauxAssistantMessage("The tick completed.")]);
      await f.harness().close(context);
      f.activateOnAdmission(await openNodeSqliteStorage(path));
      const original = automation(kind, "run:cold");
      delete original.authoritySessionNonce;
      const admit = () =>
        kind === "prompt"
          ? f.runs.admitPrompt(
              "channel:one",
              "Complete this tick.",
              original,
              context,
            )
          : f.runs.admitTool(
              "channel:one",
              { code: "actual check" },
              bindTool(f.evalTool, "sequential"),
              original,
              context,
            );
      await admit();
      await f.harness().runPass(context);
      expect(
        await f.runs.describe("channel:one", original.runId, context),
      ).toMatchObject({ state: "terminal", outcome: "succeeded" });
      const calls = f.calls();
      const modelCalls = f.faux.state.callCount;
      await f.harness().close(context);
      f.activateOnAdmission(await openNodeSqliteStorage(path));
      await admit();
      await f.harness().runPass(context);
      expect(f.calls()).toBe(calls);
      expect(f.faux.state.callCount).toBe(modelCalls);
    },
  );
  it("retains a continuing run without replacing its task authority with a separate executor admission", async () => {
    const f = await fixture({ protocol: "automation-signal.v1", prompt: null });
    const original = automation("watch", "run:continuing");
    delete original.authoritySessionNonce;
    const binding = bindTool(f.evalTool, "sequential");
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      binding,
      original,
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", original.runId, context),
    ).toMatchObject({
      state: "terminal",
      outcome: "succeeded",
    });
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      binding,
      original,
      context,
    );
    expect(f.calls()).toBe(1);
    expect(f.faux.state.callCount).toBe(0);
    await expect(
      f.runs.admitTool(
        "channel:one",
        { code: "actual check" },
        binding,
        { ...original, ownerUserId: "different-owner" },
        context,
      ),
    ).rejects.toThrow("conflicts");
  });
  it("finishes a quiet watch with one genuine direct task and no model call, preserving exact admission dedupe", async () => {
    const f = await fixture({ protocol: "automation-signal.v1", prompt: null });
    const original = automation("watch", "opaque:signal");
    const binding = bindTool(f.evalTool, "parallel");
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      binding,
      original,
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", original.runId, context),
    ).toMatchObject({ state: "terminal", outcome: "succeeded" });
    expect(f.calls()).toBe(1);
    expect(f.faux.state.callCount).toBe(0);
    expect(f.finishes).toMatchObject([
      { runId: original.runId, outcome: "succeeded" },
    ]);
    await f.runs.acknowledge("channel:one", original.runId, context);
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      binding,
      original,
      context,
    );
    expect(f.calls()).toBe(1);
    await expect(
      f.runs.admitTool(
        "channel:one",
        { code: "changed code" },
        binding,
        original,
        context,
      ),
    ).rejects.toThrow("conflicts");
    await expect(
      f.runs.describe("channel:foreign", original.runId, context),
    ).rejects.toThrow("another channel");
  });
  it("continues a signaled direct watch through one genuine native input and answers under the original product run", async () => {
    const f = await fixture({
      protocol: "automation-signal.v1",
      prompt: "Check actual change and notify owner",
    });
    f.faux.setResponses([fauxAssistantMessage("Actual change handled.")]);
    const original = automation("watch");
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      bindTool(f.evalTool, "parallel"),
      original,
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", original.runId, context),
    ).toMatchObject({
      state: "terminal",
      finalMessage: "Actual change handled.",
      outcome: "succeeded",
    });
    expect(f.calls()).toBe(1);
    expect(f.faux.state.callCount).toBe(1);
    const entries = await f.conversation().entries({}, 100, undefined, context);
    expect(
      entries.items.filter((entry) => entry.kind === "pi.direct-tool-call"),
    ).toHaveLength(1);
    expect(
      entries.items.filter((entry) => entry.kind === "pi.user"),
    ).toHaveLength(1);
    const known = (await f.finishes[0]) as { runId: string };
    expect(known.runId).toBe(original.runId);
  });
  it("fails an invalid watch signal without dispatching a model or pretending the check was quiet", async () => {
    const f = await fixture({ prompt: null });
    await f.runs.admitTool(
      "channel:one",
      { code: "invalid check" },
      bindTool(f.evalTool, "parallel"),
      automation("watch"),
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({
      state: "terminal",
      outcome: "failed",
      failure: { message: expect.stringContaining("automation-signal.v1") },
    });
    expect(f.faux.state.callCount).toBe(0);
  });
  it("retains a lost Missions finish acknowledgement in SQLite and repairs the exact native debt without repeating Eval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-automation-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const f = await fixture(
      { protocol: "automation-signal.v1", prompt: null },
      await openNodeSqliteStorage(path),
    );
    const original = new Error("Missions accepted finish response lost");
    f.fail(original);
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      bindTool(f.evalTool, "parallel"),
      automation("watch"),
      context,
    );
    await f.harness().runPass(context);
    const debt = (await f.harness().inspect(context)).tasks.find(
      (task) => task.record.kind === "vibestudio.automation-finish",
    )?.record;
    if (
      !debt ||
      debt.state.status !== "waiting" ||
      debt.state.condition.kind !== "failure"
    )
      throw new Error("Lost finish has no genuine native incident");
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({ state: "terminal", outcome: "succeeded" });
    await f.harness().close(context);
    f.fail(null);
    await f.open(await openNodeSqliteStorage(path));
    await f
      .harness()
      .retryTask(debt.id, debt.state.condition.incident, context);
    await f.harness().waitForTask(debt.id, context);
    expect(f.finishes).toEqual([f.finishes[0], f.finishes[0]]);
    expect(f.calls()).toBe(1);
  });
  it("records genuine Eval completion protocol and prompt input admission under exact original run identity", async () => {
    const f = await fixture({
      protocol: "automation-completion.v1",
      response: "Goal finished.",
    });
    await f.runs.admitTool(
      "channel:one",
      { code: "actual evaluation" },
      bindTool(f.evalTool, "parallel"),
      automation("eval"),
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({
      state: "terminal",
      completionResponse: "Goal finished.",
      finalMessage: "Goal finished.",
    });
    f.faux.setResponses([fauxAssistantMessage("Prompt tick done.")]);
    await f.runs.admitPrompt(
      "channel:one",
      "Actual task",
      automation("prompt", "run:two"),
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:two", context),
    ).toMatchObject({
      state: "terminal",
      outcome: "succeeded",
      finalMessage: "Prompt tick done.",
    });
    expect(f.faux.state.callCount).toBe(1);
  });
  it("retains actual failed tool effects when the native model recovers and answers", async () => {
    const f = await fixture(null);
    f.failEval(new Error("Original effect failed"));
    f.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("eval", { code: "actual effect" }, { id: "effect:one" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Recovered answer."),
    ]);
    await f.runs.admitPrompt(
      "channel:one",
      "Perform actual effect",
      automation("prompt"),
      context,
    );
    await f.harness().runPass(context);
    const status = await f.runs.describe("channel:one", "run:one", context);
    expect(status).toMatchObject({
      state: "terminal",
      outcome: "completed-with-errors",
      finalMessage: "Recovered answer.",
      effectFailures: [
        {
          source: {
            kind: "native-tool",
            invocationId: expect.stringMatching(/^invocation:native:/),
            nativeTaskId: expect.any(Number),
            nativeEntryId: expect.any(Number),
          },
          name: "eval",
          message: "Original effect failed",
        },
      ],
    });
    expect(f.finishes).toMatchObject([
      {
        outcome: "completed-with-errors",
        effectFailures:
          status.state === "terminal" ? status.effectFailures : [],
      },
    ]);
  });
  it("records a rejected provider call under its genuine model task and assistant entry without creating a tool invocation", async () => {
    const f = await fixture(null);
    f.faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("unoffered", {}, { id: "bad:call" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Recovered rejection."),
    ]);
    await f.runs.admitPrompt(
      "channel:one",
      "Actual prompt",
      automation("prompt"),
      context,
    );
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({
      state: "terminal",
      outcome: "completed-with-errors",
      effectFailures: [
        {
          source: {
            kind: "provider-call",
            callId: "bad:call",
            nativeTaskId: expect.any(Number),
            nativeEntryId: expect.any(Number),
            assistantEntryId: expect.any(Number),
          },
          name: "unoffered",
        },
      ],
    });
    expect(f.calls()).toBe(0);
  });
  it("does not terminalize an aborted lifecycle while its already placed native generation still owns work", async () => {
    const f = await fixture(null);
    f.blockModel();
    await f.runs.admitPrompt(
      "channel:one",
      "Actual prompt",
      automation("prompt"),
      context,
    );
    await f.harness().runPass(context);
    const live = await f.harness().inspect(context);
    const lifecycle = live.tasks.find(
      ({ record }) => record.kind === "vibestudio.automation-run",
    )?.record;
    const generation = live.tasks.find(
      ({ record }) => record.kind === "pi.generation",
    )?.record;
    if (!lifecycle || !generation)
      throw new Error("Missing actual native work");
    await f.harness().abortTask(lifecycle.id, context);
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({ state: "running" });
    expect(f.finishes).toEqual([]);
    expect(
      (await f.harness().getTask(generation.id, context))?.state.status,
    ).toBe("waiting");
    await f.harness().abortTask(generation.id, context);
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({ state: "terminal", outcome: "cancelled" });
    expect(f.finishes).toMatchObject([{ outcome: "cancelled" }]);
  });
  it("withdraws only the exact queued input and keeps unrelated admitted work active", async () => {
    const f = await fixture(null);
    f.blockModel();
    await f.runs.admitPrompt(
      "channel:one",
      "First prompt",
      automation("prompt", "run:first"),
      context,
    );
    await f.harness().runPass(context);
    await f.runs.admitPrompt(
      "channel:one",
      "Queued prompt",
      automation("prompt", "run:queued"),
      context,
    );
    const queued = await f.runs.describe("channel:one", "run:queued", context);
    expect(queued.state).toBe("queued");
    const live = await f.harness().inspect(context);
    const second = live.tasks.find(
      ({ record }) =>
        record.kind === "vibestudio.automation-run" &&
        typeof record.input === "object" &&
        record.input !== null &&
        !Array.isArray(record.input) &&
        record.input["runId"] === "run:queued",
    )?.record;
    if (!second) throw new Error("Missing queued lifecycle");
    await f.harness().abortTask(second.id, context);
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:queued", context),
    ).toMatchObject({ state: "terminal", outcome: "cancelled" });
    expect(
      await f.runs.describe("channel:one", "run:first", context),
    ).toMatchObject({ state: "running" });
  });
  it("joins actual finish acknowledgement debt on explicit retirement instead of dropping its failure", async () => {
    const f = await fixture({ protocol: "automation-signal.v1", prompt: null });
    f.fail(new Error("Original canonical finish failure"));
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      bindTool(f.evalTool, "parallel"),
      automation("watch"),
      context,
    );
    await f.harness().runPass(context);
    f.fail(null);
    await f.runs.drain(context);
    expect(
      (await f.harness().inspect(context)).tasks.filter(
        ({ record }) => record.kind === "vibestudio.automation-finish",
      ),
    ).toEqual([]);
    expect(f.finishes).toEqual([f.finishes[0], f.finishes[0]]);
    expect(f.calls()).toBe(1);
  });
  it("delivers the original parked terminal receipt after reopening storage without executing again", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "native-automation-finish-"),
    );
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const f = await fixture(
      { protocol: "automation-signal.v1", prompt: null },
      await openNodeSqliteStorage(path),
    );
    f.fail(new Error("Original finish delivery failure"));
    await f.runs.admitTool(
      "channel:one",
      { code: "actual check" },
      bindTool(f.evalTool, "parallel"),
      automation("watch"),
      context,
    );
    await f.harness().runPass(context);
    expect(f.finishes).toHaveLength(1);
    await f.harness().close(context);
    f.fail(null);
    await f.open(await openNodeSqliteStorage(path));
    await f.runs.drain(context);
    expect(f.finishes).toEqual([f.finishes[0], f.finishes[0]]);
    expect(f.calls()).toBe(1);
    expect(
      (await f.harness().inspect(context)).tasks.filter(
        ({ record }) => record.kind === "vibestudio.automation-finish",
      ),
    ).toEqual([]);
  });
  it("refuses a concurrent conflicting prompt while canonical native admission deduplicates its request", async () => {
    const f = await fixture(null);
    f.faux.setResponses([
      fauxAssistantMessage("Only original prompt handled."),
    ]);
    const original = automation("prompt");
    const results = await Promise.allSettled([
      f.runs.admitPrompt("channel:one", "First original", original, context),
      f.runs.admitPrompt(
        "channel:one",
        "Conflicting original",
        original,
        context,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(
      failure?.status === "rejected" ? failure.reason : null,
    ).toMatchObject({ message: expect.stringContaining("conflicts") });
    await f.harness().runPass(context);
    expect(f.faux.state.callCount).toBe(1);
  });
  it("recovers a genuinely accepted watch signal with a lost SQLite commit reply without repeating Eval or native input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-watch-signal-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const storage = await openNodeSqliteStorage(path);
    const original = new Error("Original watch signal commit response lost");
    let lose = true;
    const commit: Storage["commit"] = async (writes, ctx) => {
      const seq = await storage.commit(writes, ctx);
      if (
        lose &&
        writes.some(
          (write) =>
            write.type === "submission" &&
            write.value.type === "input" &&
            write.value.requestId === "automation:run:one:signal" &&
            write.value.status === "placed",
        )
      ) {
        lose = false;
        throw original;
      }
      return seq;
    };
    const intercepted = new Proxy(storage, {
      get(target, key) {
        if (key === "commit") return commit;
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const f = await fixture(
      { protocol: "automation-signal.v1", prompt: "Genuine accepted signal" },
      intercepted,
    );
    f.faux.setResponses([
      fauxAssistantMessage("Accepted signal answered once."),
    ]);
    await f.runs.admitTool(
      "channel:one",
      { code: "actual watch" },
      bindTool(f.evalTool, "parallel"),
      automation("watch"),
      context,
    );
    try {
      await f.harness().runPass(context);
    } catch {
      /* Fatal storage uncertainty is joined by close below. */
    }
    expect(lose).toBe(false);
    sessions.splice(sessions.indexOf(f.harness()), 1);
    await f
      .harness()
      .close(context)
      .catch(() => {});
    await f.open(await openNodeSqliteStorage(path));
    await f.harness().runPass(context);
    expect(
      await f.runs.describe("channel:one", "run:one", context),
    ).toMatchObject({
      state: "terminal",
      outcome: "succeeded",
      finalMessage: "Accepted signal answered once.",
    });
    expect(f.calls()).toBe(1);
    expect(f.faux.state.callCount).toBe(1);
    const entries = await f.conversation().entries({}, 100, undefined, context);
    expect(
      entries.items.filter((entry) => entry.kind === "pi.user"),
    ).toHaveLength(1);
  });
});
