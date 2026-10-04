import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  bindReceipt,
  defineTask,
  Harness,
  InboxDoc,
  MemoryStorage,
  type HarnessOptions,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import {
  abortQueuedAgentConversations,
  openBoundAgentSession,
  retainedAgentExecutionOwner,
  retireBoundAgentSession,
} from "./native-agent-session.js";

const options: HarnessOptions & {
  publishWake: NonNullable<HarnessOptions["publishWake"]>;
} = {
  models: createModels(),
  registry: createRegistry(),
  publishWake: async () => {},
};
const sessions: Harness[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close(BACKGROUND_CONTEXT)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const owner = {
  runtimeId: "do:workers/agent:Agent:one",
  contextId: "context:one",
  incarnation: "host-incarnation-one",
  authoritySessionId: "authority-session-one",
};

async function database() {
  const root = await mkdtemp(join(tmpdir(), "native-owner-lifetime-"));
  roots.push(root);
  return join(root, "agent.sqlite");
}

async function open(path: string, identity = owner, agentOptions = options) {
  const session = await openBoundAgentSession(
    await openNodeSqliteStorage(path),
    identity,
    agentOptions,
    BACKGROUND_CONTEXT
  );
  sessions.push(session);
  return session;
}

describe("retained agent execution owner", () => {
  it("reads the exact existing host binding without changing its durable identity", async () => {
    const storage = new MemoryStorage();
    const owner = {
      runtimeId: "do:workers/agent:Agent:one",
      contextId: "context:one",
      incarnation: "host-incarnation-one",
      authoritySessionId: "authority-session-one",
    };
    const session = await openBoundAgentSession(storage, owner, options, BACKGROUND_CONTEXT);
    sessions.push(session);
    const before = await storage.scanDocuments(
      { scope: { kind: "session" }, at: "current" },
      10,
      undefined,
      BACKGROUND_CONTEXT
    );
    expect(await retainedAgentExecutionOwner(session, BACKGROUND_CONTEXT)).toEqual(owner);
    expect(await retainedAgentExecutionOwner(session, BACKGROUND_CONTEXT)).toEqual(owner);
    expect(
      await storage.scanDocuments(
        { scope: { kind: "session" }, at: "current" },
        10,
        undefined,
        BACKGROUND_CONTEXT
      )
    ).toEqual(before);
  });

  it("refuses an unbound Session without creating execution authority", async () => {
    const storage = new MemoryStorage();
    const session = await Harness.open(storage, options, BACKGROUND_CONTEXT);
    sessions.push(session);
    await expect(retainedAgentExecutionOwner(session, BACKGROUND_CONTEXT)).rejects.toThrow(
      "existing host-bound owner"
    );
    expect(
      (
        await storage.scanDocuments(
          { scope: { kind: "session" }, at: "current" },
          10,
          undefined,
          BACKGROUND_CONTEXT
        )
      ).items
    ).toEqual([]);
  });

  it("refuses lifetime changes before retirement without rewriting retained history", async () => {
    const path = await database();
    const session = await open(path);
    const conversation = await session.root(BACKGROUND_CONTEXT);
    await conversation.submit(
      {
        type: "write",
        entry: {
          kind: "knowledge",
          model: [{ role: "user", content: "keep this", timestamp: 1 }],
        },
      },
      BACKGROUND_CONTEXT
    );
    const history = await conversation.context(BACKGROUND_CONTEXT);
    await session.close(BACKGROUND_CONTEXT);
    await expect(
      open(path, { ...owner, authoritySessionId: "authority-session-two" })
    ).rejects.toThrow("Retired execution owner");
    const reopened = await open(path);
    expect(await retainedAgentExecutionOwner(reopened, BACKGROUND_CONTEXT)).toEqual(owner);
    expect(
      await (await reopened.conversation(conversation.id, BACKGROUND_CONTEXT))!.context(
        BACKGROUND_CONTEXT
      )
    ).toEqual(history);
  });

  it("hands a clean retired namespace to the next canonical lifetime while retaining history and storage identity", async () => {
    const path = await database();
    const session = await open(path);
    const conversation = await session.root(BACKGROUND_CONTEXT);
    await conversation.submit(
      {
        type: "write",
        entry: {
          kind: "knowledge",
          model: [{ role: "user", content: "new-system history", timestamp: 1 }],
        },
      },
      BACKGROUND_CONTEXT
    );
    const history = await conversation.context(BACKGROUND_CONTEXT);
    await retireBoundAgentSession(session, BACKGROUND_CONTEXT);
    await expect(retainedAgentExecutionOwner(session, BACKGROUND_CONTEXT)).rejects.toThrow(
      "existing host-bound owner"
    );
    await session.close(BACKGROUND_CONTEXT);
    await expect(open(path)).rejects.toThrow("Retired execution owner");
    const nextOwner = { ...owner, authoritySessionId: "authority-session-two" };
    const next = await open(path, nextOwner);
    expect(await retainedAgentExecutionOwner(next, BACKGROUND_CONTEXT)).toEqual(nextOwner);
    const retained = await next.conversation(conversation.id, BACKGROUND_CONTEXT);
    expect(await retained!.context(BACKGROUND_CONTEXT)).toEqual(history);
    expect((await next.inspect(BACKGROUND_CONTEXT)).tasks).toEqual([]);
    await retireBoundAgentSession(next, BACKGROUND_CONTEXT);
    await next.close(BACKGROUND_CONTEXT);
    const third = await open(path, {
      ...owner,
      authoritySessionId: "authority-session-three",
    });
    expect(
      await (await third.conversation(conversation.id, BACKGROUND_CONTEXT))!.context(
        BACKGROUND_CONTEXT
      )
    ).toEqual(history);
  });

  it("cannot transfer retained storage to another context or storage incarnation after retirement", async () => {
    const path = await database();
    const session = await open(path);
    await retireBoundAgentSession(session, BACKGROUND_CONTEXT);
    await session.close(BACKGROUND_CONTEXT);
    const nextOwner = { ...owner, authoritySessionId: "authority-session-two" };
    await expect(open(path, { ...nextOwner, contextId: "context:foreign" })).rejects.toThrow(
      "Retired execution owner"
    );
    await expect(open(path, { ...nextOwner, incarnation: "different-storage" })).rejects.toThrow(
      "Retired execution owner"
    );
    expect(
      await retainedAgentExecutionOwner(await open(path, nextOwner), BACKGROUND_CONTEXT)
    ).toEqual(nextOwner);
  });

  it("joins retained conversation input without discarding passive history at retirement", async () => {
    const path = await database();
    const session = await open(path);
    const conversation = await session.root(BACKGROUND_CONTEXT);
    await conversation.submit(
      { type: "input", content: "active input with no channel subscription" },
      BACKGROUND_CONTEXT
    );
    const submission = await conversation.submit(
      { type: "input", content: "queued input with no channel subscription" },
      BACKGROUND_CONTEXT
    );
    const passive = await conversation.submit(
      {
        type: "write",
        entry: {
          kind: "knowledge",
          model: [{ role: "user", content: "retained passive history", timestamp: 1 }],
        },
      },
      BACKGROUND_CONTEXT
    );
    expect((await submission.status(BACKGROUND_CONTEXT)).status).toBe("queued");
    expect((await passive.status(BACKGROUND_CONTEXT)).status).toBe("queued");
    // With no agent configured, the initial run fails. Its still-queued follow-up
    // must be withdrawn even when no live task or channel subscription remains.
    await session.runPass(BACKGROUND_CONTEXT);
    expect(
      (await session.inspect(BACKGROUND_CONTEXT)).tasks.every(
        ({ record }) => record.state.status === "terminal"
      )
    ).toBe(true);
    await expect(retireBoundAgentSession(session, BACKGROUND_CONTEXT)).rejects.toThrow(
      "queued inputs"
    );
    expect(await abortQueuedAgentConversations(session, BACKGROUND_CONTEXT)).toBe(1);
    expect(await submission.wait(BACKGROUND_CONTEXT)).toMatchObject({
      status: "unanswered",
      reason: "aborted",
    });
    expect(
      (await session.inspect(BACKGROUND_CONTEXT)).tasks.every(
        ({ record }) => record.state.status === "terminal"
      )
    ).toBe(true);
    expect(await abortQueuedAgentConversations(session, BACKGROUND_CONTEXT)).toBe(0);
    const queuedHistory = await session.snapshot(InboxDoc, conversation.id, BACKGROUND_CONTEXT);
    expect(queuedHistory?.items).toMatchObject([{ id: passive.id, mode: "write" }]);
    await retireBoundAgentSession(session, BACKGROUND_CONTEXT);
    await session.close(BACKGROUND_CONTEXT);
    const next = await open(path, { ...owner, authoritySessionId: "authority-session-two" });
    expect(await next.snapshot(InboxDoc, conversation.id, BACKGROUND_CONTEXT)).toEqual(
      queuedHistory
    );
    const retained = await next.conversation(conversation.id, BACKGROUND_CONTEXT);
    const nextHistory = await retained!.submit(
      {
        type: "write",
        entry: {
          kind: "knowledge",
          model: [{ role: "user", content: "next lifetime history", timestamp: 2 }],
        },
      },
      BACKGROUND_CONTEXT
    );
    expect(
      (await (await next.submission(passive.id, BACKGROUND_CONTEXT))!.wait(BACKGROUND_CONTEXT))
        .status
    ).toBe("done");
    expect((await nextHistory.wait(BACKGROUND_CONTEXT)).status).toBe("done");
    const history = await retained!.context(BACKGROUND_CONTEXT);
    expect(history.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "retained passive history" }),
        expect.objectContaining({ content: "next lifetime history" }),
      ])
    );
    expect((await next.snapshot(InboxDoc, conversation.id, BACKGROUND_CONTEXT))?.items).toEqual([]);
    await retireBoundAgentSession(next, BACKGROUND_CONTEXT);
  });

  it("requires owned cancellation and joins before retirement of a task with queued input", async () => {
    const path = await database();
    const held = defineTask<null, { phase: "wait" }, null>({
      name: "test.retirement-held",
      version: 1,
      initial: () => ({ phase: "wait" }),
      phases: {
        wait: async (_task, runtime, context) => {
          await runtime.commit(
            () => ({
              status: "waiting",
              checkpoint: { phase: "wait" },
              condition: {
                kind: "receipt",
                key: "held",
                binding: "held-binding",
              },
            }),
            context
          );
        },
      },
      abort: async (_task, runtime, context) => {
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: { status: "aborted", reason: "retirement" },
          }),
          context
        );
      },
    });
    const registry = createRegistry();
    registry.install({ name: "test.retirement", tasks: [held] });
    const session = await open(path, owner, { ...options, registry });
    const conversation = await session.root(BACKGROUND_CONTEXT);
    const taskId = await conversation.commit(async (tx) => {
      await bindReceipt(tx, "held", "held-binding");
      return tx.createTask(held, null, { ownership: { kind: "conversation" } });
    }, BACKGROUND_CONTEXT);
    await session.runPass(BACKGROUND_CONTEXT);
    const submission = await conversation.submit(
      { type: "input", content: "queued" },
      BACKGROUND_CONTEXT
    );
    await expect(retireBoundAgentSession(session, BACKGROUND_CONTEXT)).rejects.toThrow(
      "unfinished tasks"
    );
    expect(await retainedAgentExecutionOwner(session, BACKGROUND_CONTEXT)).toEqual(owner);
    await conversation.abort(BACKGROUND_CONTEXT, { background: true });
    expect((await session.getTask(taskId, BACKGROUND_CONTEXT))?.state.status).toBe("terminal");
    expect((await submission.wait(BACKGROUND_CONTEXT)).status).toBe("unanswered");
    await retireBoundAgentSession(session, BACKGROUND_CONTEXT);
    await session.close(BACKGROUND_CONTEXT);
    const next = await open(path, {
      ...owner,
      authoritySessionId: "authority-session-two",
    });
    expect((await next.inspect(BACKGROUND_CONTEXT)).submissions).toEqual([]);
    expect((await next.getTask(taskId, BACKGROUND_CONTEXT))?.state.status).toBe("terminal");
  });
});
