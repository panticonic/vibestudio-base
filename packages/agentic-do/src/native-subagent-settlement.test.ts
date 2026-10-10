import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  Harness,
  MemoryStorage,
  bindReceipt,
  createRegistry,
  defineExtension,
  defineTool,
} from "@panticonic/pi-durable";
import type { RpcClient, RpcCallOptions } from "@vibestudio/rpc";
import { schemaRpcClient, wireClientFor } from "@vibestudio/rpc/internal";
import type { ParticipantDescriptor } from "@workspace/harness";
import { AgentVesselBase, type SubagentIdentity } from "./agent-vessel.js";
import { openBoundAgentSession } from "./native-agent-session.js";
import { openNativeChannelConversation } from "./native-channel-session.js";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";

const context = BACKGROUND_CONTEXT;
const parentId = "do:workers/test:TestAgent:parent";
const childId = "do:workers/test:TestAgent:child";
const identity: SubagentIdentity = {
  runId: "run:one",
  task: "Retained original assignment",
  parentRef: parentId,
  parentChannelId: "parent-channel",
  taskChannelId: "child-channel",
  parentContextId: "parent-context",
  parentParticipantId: parentId,
  depth: 1,
};
const sessions: Harness[] = [];
const databases: Array<{ close(): void }> = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((h) => h.close(context)),
  );
  for (const db of databases.splice(0)) db.close();
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
});
class Vessel extends AgentVesselBase {
  callerIdForTest: string | null = null;
  childIdentity: SubagentIdentity | null = null;
  testHarness: Harness | null = null;
  canonicalChild: Vessel | null = null;
  failRead: Error | null = null;
  reads = 0;
  terminalReports: Array<{ outcome: string; text: string; operationId: string }> = [];
  terminalFailure: Error | null = null;
  protected override async settleSubagentTerminal(...args: Parameters<AgentVesselBase["settleSubagentTerminal"]>): Promise<void> {
    const [run, outcome, text, , , , operationId] = args;
    if (this.terminalFailure) throw this.terminalFailure;
    this.terminalReports.push({ outcome, text, operationId: operationId! });
    this.subagentRuns.setStatus(run.runId, outcome);
  }
  protected override getParticipantInfo(): ParticipantDescriptor {
    return { type: "agent", name: "test", handle: "test" };
  }
  protected override get rpcCallerId() {
    return this.callerIdForTest;
  }
  protected override subagentIdentity() {
    return this.childIdentity;
  }
  protected override existingAgentSession(): Harness | null {
    return this.testHarness;
  }
  protected override admittedAgentSession(): Harness {
    if (!this.testHarness) throw new Error("No admitted native session");
    return this.testHarness;
  }
  protected override get rpc(): RpcClient {
    const wire = wireClientFor(super.rpc);
    return schemaRpcClient({
      ...wire,
      call: async (
        destination: string,
        method: string,
        args: unknown[],
        options?: RpcCallOptions,
      ): Promise<unknown> => {
        if (
          destination === childId &&
          method === "readSubagentInputSettlement"
        ) {
          this.reads++;
          if (this.failRead) throw this.failRead;
          if (!this.canonicalChild)
            throw new Error("No original retained child");
          this.canonicalChild.callerIdForTest = parentId;
          return this.canonicalChild.readSubagentInputSettlement(
            args[0] as Parameters<Vessel["readSubagentInputSettlement"]>[0],
          );
        }
        return wire.call(destination, method, args, options);
      },
    });
  }
  seedRun(
    status: "running" | "failed" | "cancelled" | "abandoned" = "running",
    runId = identity.runId,
  ) {
    this.subagentRuns.insert({
      runId,
      nativeTaskId: this.subagentRuns.listAll().length + 1,
      taskChannelId: identity.taskChannelId,
      parentContextId: identity.parentContextId!,
      childContextId: "child-context",
      childEntityId: childId,
      childParticipantId: "child-participant",
      parentChannelId: identity.parentChannelId,
      mode: "fresh",
      label: "child",
      depth: 1,
      status,
      sourceEventId: null,
      semanticIntegrationSnapshot: null,
      startedAt: 1,
      lastActivityAt: 1,
      launchConfig: null,
    });
  }
  terminal(status: "failed" | "cancelled" | "abandoned") {
    this.subagentRuns.setStatus(identity.runId, status);
  }
  status(runId = identity.runId) {
    return this.subagentRuns.get(runId)?.status;
  }
}
async function fixture(failure = false) {
  async function vessel(key: string) {
    const result = await createNativeVesselTestDO(Vessel, {
      __objectKey: key,
      WORKER_SOURCE: "workers/test",
      WORKER_CLASS_NAME: "TestAgent",
      WORKER_EXECUTION_DIGEST: "a".repeat(64),
    });
    databases.push(result.db);
    return result.instance;
  }
  const parent = await vessel("parent"),
    child = await vessel("child");
  child.childIdentity = identity;
  const models = createModels(),
    faux = fauxProvider();
  models.setProvider(faux.provider);
  faux.setResponses([failure
    ? fauxAssistantMessage("", { stopReason: "error", errorMessage: "Original child provider failure" })
    : fauxAssistantMessage("Actual settled child answer")]);
  const registry = createRegistry();
  let signalCommitted!: () => void;
  const blockedEntered = new Promise<void>((resolve) => {
    signalCommitted = resolve;
  });
  const blocked = defineTool({
    name: "owned_work",
    description: "Actual still-owned child work",
    parameters: Type.Object({}),
    execute: async (_args, api, ctx) => {
      await api.commit(
        (tx) => bindReceipt(tx, "test:child-work", "original"),
        ctx,
      );
      signalCommitted();
      return {
        wait: {
          kind: "receipt" as const,
          key: "test:child-work",
          binding: "original",
        },
        continuation: { original: true },
      };
    },
    cancel: async () => ({ content: [] }),
  });
  registry.install(defineExtension({ name: "child-work", tools: [blocked] }));
  const harness = await openBoundAgentSession(
    new MemoryStorage(),
    {
      runtimeId: childId,
      contextId: "child-context",
      incarnation: "child-storage",
      authoritySessionId: "original-child-lifetime",
    },
    { models, registry, publishWake: async () => {} },
    context,
  );
  sessions.push(harness);
  child.testHarness = harness;
  parent.canonicalChild = child;
  parent.callerIdForTest = childId;
  parent.seedRun();
  const conversation = await openNativeChannelConversation(
    harness,
    { channelId: identity.taskChannelId, contextId: "child-context" },
    { model: { provider: "faux", modelId: "faux-1" }, tools: [blocked] },
    context,
  );
  const submission = await conversation.submit(
    {
      type: "input",
      requestId: "actual-child-input",
      content: "Do the retained assignment",
    },
    context,
  );
  await submission.wait(context);
  const input = {
    runId: identity.runId,
    taskChannelId: identity.taskChannelId,
    submissionId: submission.id,
  };
  return {
    parent,
    child,
    harness,
    conversation,
    input,
    blocked,
    blockedEntered,
  };
}

describe("native shipping subagent input settlement", () => {
  it("retires an existing child execution after lifecycle quiescence seals new admission", async () => {
    const f = await fixture();
    f.child.callerIdForTest = parentId;
    await expect(f.child.releaseForLifecycle({
      epoch: "context-retirement",
      phase: "quiesce",
      mode: "retire",
      reason: "parent context retired",
      deadlineMs: 0,
    })).resolves.toEqual({ status: "ready" });
    await expect(f.child.retireSubagentExecution({
      runId: identity.runId,
      taskChannelId: identity.taskChannelId,
      reason: "supervisor retired",
    })).resolves.toEqual({ retired: true });
    await expect(f.child.retireSubagentExecution({
      runId: identity.runId,
      taskChannelId: identity.taskChannelId,
      reason: "supervisor retired",
    })).resolves.toEqual({ retired: true });
  });
  it("authenticates the original child and rereads an actual terminal native input before marking only that execution idle", async () => {
    const f = await fixture();
    f.parent.seedRun("running", "independent-sibling");
    await expect(f.parent.onSubagentInputSettled(f.input)).resolves.toEqual({
      recorded: true,
    });
    expect(f.parent.status()).toBe("completed");
    expect(f.parent.status("independent-sibling")).toBe("running");
    await expect(f.parent.onSubagentInputSettled(f.input)).resolves.toEqual({
      recorded: true,
    });
    expect(f.parent.reads).toBe(2);
    expect(
      (await f.conversation.entries({}, 100, undefined, context)).items.some(
        (entry) => entry.kind === "pi.assistant",
      ),
    ).toBe(true);
  });
  it("reports a terminal child input failure through the retained supervisor terminal path", async () => {
    const f = await fixture(true);
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.status()).toBe("failed");
    expect(f.parent.terminalReports).toEqual([{ outcome: "failed", text: "Original child provider failure", operationId: `native-input:${f.input.submissionId}` }]);
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.terminalReports).toHaveLength(1);
  });
  it("keeps failed terminal publication owned until its original operation is explicitly retried", async () => {
    const f = await fixture(true);
    const original = new Error("Original terminal publication failed");
    f.parent.terminalFailure = original;
    await expect(f.parent.onSubagentInputSettled(f.input)).rejects.toBe(original);
    expect(f.parent.status()).toBe("running");
    f.parent.terminalFailure = null;
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.terminalReports[0]?.operationId).toBe(`native-input:${f.input.submissionId}`);
    expect(f.parent.status()).toBe("failed");
  });
  it("does not infer idle from an older settled input while newer genuine child work remains active", async () => {
    const f = await fixture();
    const task = await f.conversation.invokeTool(
      { id: "next-work", name: f.blocked.name, arguments: {} },
      context,
    );
    await f.blockedEntered;
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.status()).toBe("running");
    await f.conversation.abort(context);
    await f.harness.waitForTask(task, context);
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.status()).toBe("completed");
  });
  it.each(["failed", "cancelled", "abandoned"] as const)(
    "does not overwrite a retained %s terminal with late native input settlement",
    async (status) => {
      const f = await fixture();
      // Separate original domain terminal, not inferred from the report's wording.
      f.parent.terminal(status);
      await f.parent.onSubagentInputSettled(f.input);
      expect(f.parent.status()).toBe(status);
    },
  );
  it("refuses a foreign sender or changed run/channel before asking the child for evidence", async () => {
    const f = await fixture();
    f.parent.callerIdForTest = "foreign-child";
    await expect(f.parent.onSubagentInputSettled(f.input)).rejects.toThrow(
      "sender does not own",
    );
    f.parent.callerIdForTest = childId;
    await expect(
      f.parent.onSubagentInputSettled({ ...f.input, runId: "unknown" }),
    ).rejects.toThrow("sender does not own");
    await expect(
      f.parent.onSubagentInputSettled({ ...f.input, taskChannelId: "other" }),
    ).rejects.toThrow("sender does not own");
    expect(f.parent.reads).toBe(0);
    expect(f.parent.status()).toBe("running");
  });
  it("preserves a lost canonical read failure and leaves the original execution retryable", async () => {
    const f = await fixture(),
      original = new Error("Original child settlement read lost");
    f.parent.failRead = original;
    await expect(f.parent.onSubagentInputSettled(f.input)).rejects.toBe(
      original,
    );
    expect(f.parent.status()).toBe("running");
    f.parent.failRead = null;
    await f.parent.onSubagentInputSettled(f.input);
    expect(f.parent.status()).toBe("completed");
  });
  it("rejects foreign supervisor, unknown input and input from a different native conversation", async () => {
    const f = await fixture();
    f.child.callerIdForTest = "foreign-supervisor";
    await expect(f.child.readSubagentInputSettlement(f.input)).rejects.toThrow(
      "original supervisor or input",
    );
    f.child.callerIdForTest = parentId;
    await expect(
      f.child.readSubagentInputSettlement({ ...f.input, submissionId: 99999 }),
    ).rejects.toThrow("actual terminal native input");
    const other = await f.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: { model: { provider: "faux", modelId: "faux-1" } },
      },
      context,
    );
    const foreign = await other.submit(
      { type: "input", content: "Other conversation" },
      context,
    );
    await foreign.wait(context);
    await expect(
      f.child.readSubagentInputSettlement({
        ...f.input,
        submissionId: foreign.id,
      }),
    ).rejects.toThrow("actual terminal native input");
  });
});
