/**
 * Direct store-level tests for `ChatSession` (no React) against a real
 * `PubSubChannel` through the Node-capable transcript harness.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  brandId,
  type AgenticEvent,
  type BlockId,
  type MessageId,
  type TurnId,
} from "@workspace/agentic-protocol";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import type { PubSubClient } from "@workspace/pubsub";
import {
  ChatSession,
  type ChatAgentHost,
  type ChatSessionOptions,
} from "@workspace/agentic-core/chat-store";
import { assistantMessage, createTranscriptHarness } from "./transcriptTestHarness.js";

type Harness = Awaited<ReturnType<typeof createTranscriptHarness>>;

const CONTEXT = "ctx-transcript-pipeline";
const PANEL_ID = "panel:chat";
const AGENT_ID = "agent:onboarding";

async function until(check: () => boolean, label = "condition"): Promise<void> {
  // Test-runner bound: a loaded host still settles well within this.
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`${label} not reached`);
}

const owned: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of owned.splice(0).reverse()) await cleanup();
  vi.useRealTimers();
});

function panelRpc(harness: Harness) {
  return harness.createParticipantRpc({
    id: PANEL_ID,
    name: "User",
    type: "panel",
    handle: "alice",
  });
}

function createSession(
  harness: Harness,
  overrides: Partial<ChatSessionOptions> = {}
): { session: ChatSession; titles: Array<{ title: string; explicit: boolean }> } {
  const titles: Array<{ title: string; explicit: boolean }> = [];
  const session = new ChatSession({
    config: { clientId: PANEL_ID, rpc: panelRpc(harness) as never },
    channelName: harness.channelId,
    contextId: CONTEXT,
    metadata: { name: "User", type: "panel", handle: "alice" },
    ports: { presentTitle: (title, { explicit }) => titles.push({ title, explicit }) },
    ...overrides,
  });
  owned.push(() => session.dispose());
  return { session, titles };
}

function connectAgent(harness: Harness, id = AGENT_ID): PubSubClient {
  const agent = harness.connectParticipant({
    id,
    name: "Onboarding Agent",
    type: "agent",
    handle: id === AGENT_ID ? "agent" : id.replace(/[^a-z]/gi, ""),
  });
  owned.push(() => agent.close());
  return agent;
}

const agentActor = { kind: "agent" as const, id: AGENT_ID, displayName: "Onboarding Agent" };

function turnEvent(kind: "turn.opened" | "turn.closed", turn: string): AgenticEvent {
  return {
    kind,
    actor: agentActor,
    turnId: brandId<TurnId>(turn),
    payload: { protocol: AGENTIC_PROTOCOL_VERSION },
    createdAt: new Date().toISOString(),
  } as AgenticEvent;
}

function messageStarted(id: string): AgenticEvent<"message.started"> {
  return {
    kind: "message.started",
    actor: agentActor,
    causality: { messageId: brandId<MessageId>(id) },
    payload: { protocol: AGENTIC_PROTOCOL_VERSION, role: "assistant", blocks: [] },
    createdAt: new Date().toISOString(),
  } as AgenticEvent<"message.started">;
}

function messageDelta(id: string, text: string): AgenticEvent<"message.delta"> {
  return {
    kind: "message.delta",
    actor: agentActor,
    causality: { messageId: brandId<MessageId>(id) },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      blockId: brandId<BlockId>(`${id}:block:0`),
      type: "text",
      text,
    },
    createdAt: new Date().toISOString(),
  } as unknown as AgenticEvent<"message.delta">;
}

async function publish(agent: PubSubClient, event: AgenticEvent): Promise<void> {
  await agent.publish(AGENTIC_EVENT_PAYLOAD_KIND, event, {
    idempotencyKey: crypto.randomUUID(),
  });
}

describe("ChatSession (stream delivery)", () => {
  it("joins with composed method providers, settles replay and projects live agent output", async () => {
    const harness = await createTranscriptHarness("chat-session-join");
    const agent = connectAgent(harness);
    await agent.ready();
    await publish(agent, assistantMessage("history", "Before the panel joined"));
    const { session } = createSession(harness);
    session.registerMethods("tools", () => ({
      ping: { description: "Ping", parameters: z.object({}), execute: async () => "pong" },
    }));
    session.registerMethods("ui", () => ({
      card: { description: "Card", parameters: z.object({}), execute: async () => "ok" },
    }));
    const release = session.retain();
    owned.push(release);
    session.start();
    await until(() => session.getSnapshot().replaySettled, "replay settled");
    await until(
      () => session.getSnapshot().messages.some((message) => message.id === "history"),
      "replayed history"
    );
    const joined = session.getSnapshot();
    expect(joined.connected).toBe(true);
    expect(joined.selfId).toBe(PANEL_ID);
    // The advertised methods are the composed registry.
    const self = Object.values(joined.participants).find((p) => p.id === PANEL_ID);
    expect(self?.metadata.methods?.map((method) => method.name).sort()).toEqual(["card", "ping"]);
    expect(Object.keys(joined.participants)).toContain(AGENT_ID);
    expect(Object.keys(joined.allParticipants)).toContain(AGENT_ID);

    await publish(agent, turnEvent("turn.opened", "turn-1"));
    await until(() => session.getSnapshot().agentBusy, "agent busy");
    expect(session.getSnapshot().primaryActionIntent).toBe("steer");
    await publish(agent, assistantMessage("live", "Live answer"));
    await until(
      () => session.getSnapshot().messages.some((message) => message.id === "live"),
      "live message"
    );
    await publish(agent, turnEvent("turn.closed", "turn-1"));
    await until(() => !session.getSnapshot().agentBusy, "agent idle");
    expect(session.getSnapshot().primaryActionIntent).toBe("send");
  });

  it("fails the join visibly when two providers claim one method", async () => {
    const harness = await createTranscriptHarness("chat-session-duplicate-methods");
    const { session } = createSession(harness);
    const method = { description: "Dup", parameters: z.object({}), execute: async () => null };
    session.registerMethods("a", () => ({ dup: method }));
    session.registerMethods("b", () => ({ dup: method }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    owned.push(() => error.mockRestore());
    owned.push(session.retain());
    session.start();
    await until(() => session.getSnapshot().connectionError !== null, "join failure surfaced");
    expect(session.getSnapshot().connectionError?.message).toContain('"dup" has multiple owners');
    expect(session.getSnapshot().connected).toBe(false);
    expect(session.client).toBeNull();
    // Terminal: the loop does not retry a defect as a transient failure.
    const calls = error.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(error.mock.calls.length).toBe(calls);
  });
});

describe("ChatSession message.delta streaming", () => {
  it("shows coalesced partial text, then the durable completion, keeping unchanged message identity", async () => {
    const harness = await createTranscriptHarness("chat-session-delta");
    const agent = connectAgent(harness);
    await agent.ready();
    await publish(agent, assistantMessage("stable", "An unchanged earlier answer"));
    const { session } = createSession(harness);
    owned.push(session.retain());
    session.start();
    await until(
      () => session.getSnapshot().messages.some((message) => message.id === "stable"),
      "history"
    );
    const stable = session.getSnapshot().messages.find((message) => message.id === "stable");

    await publish(agent, messageStarted("streamed"));
    await until(() => "streamed" in session.feed.view.messages, "started message reduced");
    const signalRpc = harness.createParticipantRpc({
      id: AGENT_ID,
      name: "Onboarding Agent",
      type: "agent",
      handle: "agent",
    });
    const target = `do:workers/pubsub-channel:PubSubChannel:${harness.channelId}`;
    await signalRpc.call(target, channelClientRpcMethods.sendSignal, [
      AGENT_ID,
      JSON.stringify([messageDelta("streamed", "Hel"), messageDelta("streamed", "lo")]),
      AGENTIC_EVENT_PAYLOAD_KIND,
    ]);
    await until(
      () =>
        session.getSnapshot().messages.find((message) => message.id === "streamed")?.content ===
        "Hello",
      "partial streamed text"
    );
    expect(session.getSnapshot().messages.find((message) => message.id === "stable")).toBe(stable);

    await publish(agent, assistantMessage("streamed", "Hello, world."));
    await until(() => {
      const message = session.getSnapshot().messages.find((item) => item.id === "streamed");
      return message?.content === "Hello, world." && message.complete === true;
    }, "durable completion");
    expect(session.getSnapshot().messages.find((message) => message.id === "stable")).toBe(stable);
  });
});

describe("ChatSession outbox", () => {
  async function joined(name: string) {
    const harness = await createTranscriptHarness(name);
    const agent = connectAgent(harness);
    await agent.ready();
    const created = createSession(harness);
    owned.push(created.session.retain());
    created.session.start();
    await until(() => created.session.getSnapshot().replaySettled, "replay settled");
    await until(
      () => AGENT_ID in created.session.getSnapshot().participants,
      "agent in roster"
    );
    return { harness, agent, ...created };
  }

  it("sends the draft, reads its own message back and titles the chat once", async () => {
    const { session, titles } = await joined("chat-session-send");
    session.setInput("  Plan my week  ");
    await session.sendMessage();
    const snapshot = session.getSnapshot();
    expect(snapshot.input).toBe("");
    expect(snapshot.pendingSendCount).toBe(0);
    expect(
      snapshot.messages.some(
        (message) => message.senderId === PANEL_ID && message.content === "Plan my week"
      )
    ).toBe(true);
    expect(titles).toEqual([{ title: "Plan my week", explicit: false }]);
    expect(snapshot.channelTitle).toBe("Plan my week");

    session.setInput("A second message");
    await session.sendMessage();
    // Later sends never re-derive the default title (the persisted config may
    // re-present the same one).
    expect(titles.every((entry) => entry.title === "Plan my week" && !entry.explicit)).toBe(true);
  });

  it("restores a rejected draft beside a newer one", async () => {
    const { session } = await joined("chat-session-send-failure");
    let reject!: (error: Error) => void;
    vi.spyOn(session.client!, "send").mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      })
    );
    session.setInput("Original");
    session.setReplyTo("message-1");
    const sending = session.sendMessage(undefined, { replyTo: "message-1" });
    expect(session.getSnapshot().pendingSendCount).toBe(1);
    expect(session.getSnapshot().replyTo).toBeNull();
    session.setInput("Newer");
    const failure = new Error("Publication rejected");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    owned.push(() => error.mockRestore());
    reject(failure);
    await expect(sending).rejects.toBe(failure);
    expect(session.getSnapshot().input).toBe("Newer\n\nOriginal");
    expect(session.getSnapshot().pendingSendCount).toBe(0);
    // A newer draft keeps its own (empty) reply target.
    expect(session.getSnapshot().replyTo).toBeNull();
  });

  it("edits keeping attachment blocks, cancels with an undo window, and re-sends on undo", async () => {
    const { session } = await joined("chat-session-edit-cancel");
    session.setInput("Draft to edit");
    await session.sendMessage();
    const sent = session.getSnapshot().messages.find((m) => m.senderId === PANEL_ID)!;
    const client = session.client!;
    const edit = vi.spyOn(client, "editMessage");
    await session.editPendingMessage(sent.id, "Edited text");
    expect(edit).toHaveBeenCalledWith(
      sent.id,
      [{ blockId: `${sent.id}:block:0`, type: "text", content: "Edited text" }],
      { revision: sent.revision }
    );

    const retract = vi.spyOn(client, "retractMessage");
    await session.cancelPendingMessage(sent.id);
    expect(retract).toHaveBeenCalledWith(sent.id, { reason: "Canceled by author" });
    expect(session.getSnapshot().undoableAction).toMatchObject({
      kind: "cancel",
      messageIds: [sent.id],
      textOnlyRestore: false,
    });
    const resend = vi.spyOn(client, "send");
    session.undoLastAction();
    expect(session.getSnapshot().undoableAction).toBeUndefined();
    // Undo re-sends the text retained when the message was cancelled.
    expect(resend).toHaveBeenCalledWith(sent.content, {});
  });

  it("closes the undo window after its product delay", async () => {
    const { session } = await joined("chat-session-undo-window");
    session.setInput("Short lived");
    await session.sendMessage();
    const sent = session.getSnapshot().messages.find((m) => m.senderId === PANEL_ID)!;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await session.cancelPendingMessage(sent.id);
    expect(session.getSnapshot().undoableAction?.messageIds).toEqual([sent.id]);
    vi.advanceTimersByTime(5_000);
    expect(session.getSnapshot().undoableAction).toBeUndefined();
    vi.useRealTimers();
    // A closed window leaves nothing to undo.
    const resend = vi.spyOn(session.client!, "send");
    session.undoLastAction();
    expect(resend).not.toHaveBeenCalled();
  });

  it("tags after-turn sends and prunes them once read", async () => {
    const { session, agent } = await joined("chat-session-after-turn");
    session.setInput("After this turn");
    await session.sendMessage(undefined, { metadata: { deliverAfterTurn: true } });
    const sent = session.getSnapshot().messages.find((m) => m.senderId === PANEL_ID)!;
    expect(session.getSnapshot().afterTurnMessageIds.has(sent.id)).toBe(true);
    // Cancelling an after-turn message records that a text-only restore loses
    // its after-turn intent.
    vi.spyOn(session.client!, "retractMessage").mockResolvedValue({ pubsubId: undefined });
    await session.cancelPendingMessage(sent.id);
    expect(session.getSnapshot().undoableAction?.textOnlyRestore).toBe(true);
    // Once the agent reads it, it leaves the outbox lane.
    // Read receipts arrive as live signals carrying an agentic event object.
    await agent.recordReadReceipt(sent.id);
    await until(
      () => !session.getSnapshot().afterTurnMessageIds.has(sent.id),
      "after-turn id pruned once read"
    );
  });

  it("narrates a flush and surfaces the original interrupt failure", async () => {
    const { session } = await joined("chat-session-flush");
    const call = vi.spyOn(session.client!, "callMethod");
    call.mockReturnValue({ result: Promise.resolve({ paused: true }) } as never);
    await session.flushOutboxAndInterrupt();
    expect(call).toHaveBeenCalledWith(
      AGENT_ID,
      "pause",
      expect.objectContaining({ flushDeferred: true })
    );
    expect(session.getSnapshot().flushNarration).toEqual({ text: "Interrupted", remaining: 0 });

    const failure = new Error("Agent unreachable");
    call.mockReturnValue({ result: Promise.reject(failure) } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    owned.push(() => warn.mockRestore());
    await session.interruptAgent("agent");
    expect(session.getSnapshot().connectionError).toMatchObject({
      message: "Couldn't stop the agent: Agent unreachable",
      cause: failure,
    });
  });
});

describe("ChatSession reconnect and lifetime", () => {
  it("keeps a live join on host-unblocked, replaces it on user-retry, and keeps the transcript until the new one delivers", async () => {
    const harness = await createTranscriptHarness("chat-session-reconnect");
    const agent = connectAgent(harness);
    await agent.ready();
    await publish(agent, assistantMessage("kept", "Visible across reconnect"));
    const { session } = createSession(harness);
    owned.push(session.retain());
    session.start();
    await until(
      () => session.getSnapshot().messages.some((message) => message.id === "kept"),
      "history"
    );
    const first = session.client;
    session.reconnect("host-unblocked");
    expect(session.client).toBe(first);

    session.reconnect("user-retry");
    // The previous transcript stays visible while the new generation joins.
    expect(session.getSnapshot().messages.some((message) => message.id === "kept")).toBe(true);
    await until(() => session.client !== null && session.client !== first, "replacement join");
    await until(
      () => session.getSnapshot().messages.some((message) => message.id === "kept"),
      "replayed into the new generation"
    );
    expect(session.getSnapshot().connected).toBe(true);
  });

  it("retries a failed join on host-unblocked", async () => {
    const harness = await createTranscriptHarness("chat-session-retry-failed");
    const rpc = panelRpc(harness);
    const blocked = Object.assign(new Error("Review required"), { errorKind: "access" });
    let block = true;
    const call = rpc.call;
    const guarded = {
      ...rpc,
      call: ((target: string, method: unknown, ...rest: unknown[]) => {
        if (block && String((method as { name?: string })?.name ?? method).includes("resolveService"))
          return Promise.reject(blocked);
        return (call as (...values: unknown[]) => unknown)(target, method, ...rest);
      }) as typeof rpc.call,
    };
    const { session } = createSession(harness, {
      config: { clientId: PANEL_ID, rpc: guarded as never },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    owned.push(() => error.mockRestore());
    owned.push(session.retain());
    session.start();
    await until(() => session.getSnapshot().connectionError !== null, "terminal failure");
    expect(session.client).toBeNull();
    block = false;
    session.reconnect("host-unblocked");
    await until(() => session.getSnapshot().connected && session.client !== null, "retried join");
    expect(session.getSnapshot().connectionError).toBeNull();
  });

  it("defers disposal one turn, so a same-turn re-retain keeps the instance", async () => {
    const harness = await createTranscriptHarness("chat-session-retain");
    const { session } = createSession(harness);
    const release = session.retain();
    session.start();
    await until(() => session.client !== null, "joined");
    const client = session.client;
    // StrictMode: unmount and remount in the same turn.
    release();
    const again = session.retain();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.client).toBe(client);
    again();
    await until(() => session.client === null, "disposed after the final release");
  });
});

describe("ChatSession titles", () => {
  it("presents an explicit channel title as explicit", async () => {
    const harness = await createTranscriptHarness("chat-session-explicit-title");
    const { session, titles } = createSession(harness);
    owned.push(session.retain());
    session.start();
    await until(() => session.client !== null, "joined");
    await session.client!.updateChannelConfig({ title: "Release plan", titleExplicit: true });
    await until(() => titles.some((entry) => entry.title === "Release plan"), "title presented");
    expect(titles.at(-1)).toEqual({ title: "Release plan", explicit: true });
    expect(session.getSnapshot().channelTitle).toBe("Release plan");
  });
});

describe("ChatSession first-agent flow", () => {
  it("holds the first message, spawns one agent, and delivers it live after the join", async () => {
    const harness = await createTranscriptHarness("chat-session-first-agent");
    const created: PubSubClient[] = [];
    const onAddAgent = vi.fn(async () => {
      const agent = connectAgent(harness);
      created.push(agent);
      await agent.ready();
    });
    const host: ChatAgentHost = {
      onAddAgent,
      availableAgents: [
        {
          id: "workers/agent-worker",
          className: "AiChatWorker",
          name: "AI Chat",
          proposedHandle: "ai-chat",
        },
      ],
      modelCatalog: null,
      firstAgentModelPreflight: "ready",
    };
    const { session } = createSession(harness, {
      channelConfig: { seed: { messages: [{ author: "Intro", content: "Welcome" }] } } as never,
      agentHost: host,
    });
    owned.push(session.retain());
    session.start();
    await until(() => session.getSnapshot().replaySettled, "replay settled");
    await until(
      () => session.deferredAgent.getSnapshot().deferredAgent?.setupActive === true,
      "first-agent setup"
    );
    session.deferredAgent.getSnapshot().deferredAgent!.setDraft({ model: "openai:test" });
    const deferredBefore = session.deferredAgent.getSnapshot();
    // An equal but new catalog list does not churn the flow's snapshot.
    session.setAgentHost({ ...host, availableAgents: [...host.availableAgents!] });
    expect(session.deferredAgent.getSnapshot()).toBe(deferredBefore);

    session.setInput("Hello first agent");
    await session.submit();
    expect(session.getSnapshot().input).toBe("");
    await until(() => created.length === 1, "agent spawned");
    await until(
      () =>
        session
          .getSnapshot()
          .messages.some(
            (message) => message.senderId === PANEL_ID && message.content === "Hello first agent"
          ),
      "queued message delivered"
    );
    await until(
      () => (session.deferredAgent.getSnapshot().deferredAgent?.queued.length ?? 0) === 0,
      "queue drained"
    );
    expect(onAddAgent).toHaveBeenCalledTimes(1);
  });
});
